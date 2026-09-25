import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import limiter from '@adonisjs/limiter/services/main'
import { blindIndex } from '#utils/blind_index'
import PersonEmailProbeLogService from '#services/person_email_probe_log_service'
import { respondPersonEmailProbeRateLimit } from '#helpers/person_email_request_errors'

/**
 * Contador del sondeo de correo personal (USRH1789762889970).
 *
 * Cuenta el INTENTO que carga un `personEmail` no vacío, no la petición: el
 * limiter de ruta no puede discriminarlo, y calibrarlo para el sondeo cortaría
 * el alta masiva legítima (bajo corta a la capturista de 15 altas; alto deja
 * ~40 respuestas de oráculo por minuto).
 *
 * Llave propia y separada del piso de escritura: probar correos y automatizar
 * altas son dos abusos distintos, y mezclarlos en un contador haría que uno
 * tapara al otro (mismo argumento que `access_point_lookup.ts:142-147`).
 *
 * REGLA DURA — SE CONSUME CUOTA EN TODO INTENTO. Queda prohibido cobrar cuota
 * solo ante el fallo (la semántica documentada como contraejemplo en
 * `complaint_status_rate_limit.ts:5-9`, "solo los fallos consumen cuota"): con
 * esa regla el 429 solo le llegaría a quien acertó y el límite se convertiría en
 * un oráculo amplificado y gratis, atravesando un mensaje por lo demás
 * indistinguible.
 *
 * EFECTIVO HOY POR TOPOLOGÍA (un solo proceso Node), decorativo en cuanto haya
 * más de uno: el contador vive en el store `memory`, que es POR PROCESO — con N
 * procesos el techo real se multiplica por N en silencio (ninguna prueba falla)
 * y se pierde por completo en cada reinicio. Mientras corra un solo proceso,
 * este límite y el piso de ruta sí cortan de verdad.
 */
export const PERSON_EMAIL_PROBE_RATE = {
  requests: 20,
  duration: '1 hour',
  blockMinutes: 60,
} as const

export interface PersonEmailProbeThrottle {
  isBlocked(subject: string): Promise<boolean>
  count(subject: string): Promise<'ok' | 'threshold_reached'>
}

export interface PersonEmailProbeRate {
  readonly requests: number
  readonly duration: string
  readonly blockMinutes: number
}

export class PersonEmailProbeThrottleMemory implements PersonEmailProbeThrottle {
  protected rate: PersonEmailProbeRate = PERSON_EMAIL_PROBE_RATE

  private counter() {
    return limiter.use({ requests: this.rate.requests, duration: this.rate.duration })
  }

  private key(subject: string): string {
    return `person-email-probe:${subject}`
  }

  async isBlocked(subject: string): Promise<boolean> {
    return this.counter().isBlocked(this.key(subject))
  }

  async count(subject: string): Promise<'ok' | 'threshold_reached'> {
    const counter = this.counter()
    const key = this.key(subject)
    const state = await counter.increment(key)
    if (state.remaining > 0) return 'ok'
    await counter.block(key, `${this.rate.blockMinutes} minutes`)
    return 'threshold_reached'
  }
}

/**
 * Techo por empresa contra rotación de cuentas. Mucho más holgado que el de
 * usuario: no puede dejar sin operar a una empresa por el comportamiento de una
 * sola capturista, pero cierra la rotación de cuentas por debajo del umbral.
 * Misma clase, otra llave y otro umbral.
 */
export const PERSON_EMAIL_PROBE_BUSINESS_RATE = {
  requests: 200,
  duration: '1 hour',
  blockMinutes: 60,
} as const

export class PersonEmailProbeBusinessThrottleMemory extends PersonEmailProbeThrottleMemory {
  protected override rate = PERSON_EMAIL_PROBE_BUSINESS_RATE
}

const userThrottle = new PersonEmailProbeThrottleMemory()
const businessThrottle = new PersonEmailProbeBusinessThrottleMemory()

/**
 * Guard de ruta: cuenta el intento y corta al topar.
 *
 * Reparto del registro, fijado por la resolución del corte:
 * - `rate_limited` se registra AQUÍ, porque el corte por límite nace aquí y no
 *   llega nunca al controlador;
 * - `accepted` y `rejected_not_available` se registran en `person_controller.ts`
 *   (vía `logPersonEmailProbe`), donde el desenlace se conoce por TIPO gracias a
 *   la unión discriminada que deja `USRH1789698261614` en `verifyInfo` — no por
 *   reinterpretar el cuerpo de la respuesta.
 *
 * El contexto que deja en `ctx.personEmailProbe` lleva listos el hash y el actor
 * para que el controlador no recalcule `blindIndex` ni repita la regla del
 * correo vacío. NO se anota `Promise<void>`: la respuesta del corte (el 429 de
 * `respondPersonEmailProbeRateLimit`) SE DEVUELVE, así que el retorno es el
 * `Response` del corte o el de `next()`, nunca `undefined`.
 */
export async function personEmailProbeGuard(ctx: HttpContext, next: NextFn) {
  const raw = ctx.request.input('personEmail')
  const personEmail = typeof raw === 'string' ? raw.trim() : ''

  // Correo vacío o nulo NO es intento: no consume cuota, no se registra y JAMÁS
  // se hashea — `blindIndex('')` es una constante que envenenaría la colección.
  if (personEmail === '') {
    return next()
  }

  const actorUserId = ctx.auth.user?.userId ?? null
  // Fallback a IP, NUNCA a un literal tipo 'anonimo': sería un cubo global único.
  const subject = `user:${actorUserId ?? ctx.request.ip()}`
  const businessUnitScope = ctx.businessUnitScope ?? []
  const businessSubject = `bu:${businessUnitScope[0] ?? 'sin-empresa'}`
  const emailHash = blindIndex(personEmail)
  const path = ctx.request.method() === 'POST' ? 'store' : 'update'
  const targetPersonId = path === 'store' ? null : Number(ctx.params.personId) || null

  if ((await userThrottle.isBlocked(subject)) || (await businessThrottle.isBlocked(businessSubject))) {
    await PersonEmailProbeLogService.log({
      path,
      personEmailHash: emailHash,
      outcome: 'rate_limited',
      actorUserId,
      businessUnitScope,
      targetPersonId,
    })
    return respondPersonEmailProbeRateLimit(
      ctx,
      PERSON_EMAIL_PROBE_RATE.blockMinutes * 60,
      PERSON_EMAIL_PROBE_RATE.requests
    )
  }

  // Consumo en TODO intento y en los DOS contadores, ANTES de conocer el
  // desenlace. Ver la regla dura: prohibido cobrar cuota solo ante el fallo. El
  // retorno se ignora: cuando `count` alcanza el techo, el corte cae recién en el
  // intento SIGUIENTE, que es el que `isBlocked` rechaza (por eso el 21º intento
  // recibe el 429 y los 20 primeros pasan).
  await userThrottle.count(subject)
  await businessThrottle.count(businessSubject)

  // El desenlace lo registra el controlador vía `logPersonEmailProbe`: aquí
  // todavía no se conoce.
  ctx.personEmailProbe = { path, emailHash, actorUserId, businessUnitScope, targetPersonId }

  return next()
}

/** Contexto del intento, dejado por el guard para que el controlador no recalcule el hash. */
export interface PersonEmailProbeContext {
  /** Camino que originó el intento: `store` en el alta, `update` en la edición. */
  path: 'store' | 'update'
  /** `blindIndex(correo)`. NUNCA el correo en claro. */
  emailHash: string
  /** Actor autenticado; `null` si no hay sesión (sujeto por IP). */
  actorUserId: number | null
  /** Scope de empresas DEL ACTOR. Nunca el del titular colisionado. */
  businessUnitScope: number[]
  /** Expediente sobre el que se escribe; `null` en el alta. */
  targetPersonId: number | null
}

/**
 * Registra el desenlace `accepted` / `rejected_not_available` en la bitácora,
 * reutilizando el contexto que dejó el guard (mismo hash, mismo actor, misma
 * empresa, mismo expediente — sin recalcular nada).
 *
 * Si el correo venía vacío el guard no dejó contexto y aquí no se escribe NADA:
 * la regla del correo vacío se decide en un solo lugar.
 */
export async function logPersonEmailProbe(
  ctx: HttpContext,
  outcome: 'accepted' | 'rejected_not_available'
): Promise<void> {
  const probe = ctx.personEmailProbe
  if (!probe) return

  await PersonEmailProbeLogService.log({
    path: probe.path,
    personEmailHash: probe.emailHash,
    outcome,
    actorUserId: probe.actorUserId,
    businessUnitScope: probe.businessUnitScope,
    targetPersonId: probe.targetPersonId,
  })
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    personEmailProbe?: PersonEmailProbeContext
  }
}
