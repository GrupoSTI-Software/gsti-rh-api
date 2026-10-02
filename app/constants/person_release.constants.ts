import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import env from '#start/env'

/**
 * Ventana de frescura de la compensación del alta fallida (USRH1789698261608).
 *
 * La persona nace en `POST /api/persons`, otra petición HTTP que no deja rastro
 * del actor ni del acto: `person_created_at` es la ÚNICA señal disponible en
 * MySQL para distinguir "la persona que se acaba de crear para este alta" de
 * "cualquier persona del sistema". La ventana no prueba el acto, lo aproxima.
 *
 * Los topes duros viven en código: aflojar la ventana más allá de un día exige
 * cambiar código y pasar por revisión. No es configuración de negocio — no vive
 * en `system_settings` y no se publica.
 */
export const PERSON_RELEASE_WINDOW_MINUTES_DEFAULT = 60
export const PERSON_RELEASE_WINDOW_MINUTES_MIN = 1
export const PERSON_RELEASE_WINDOW_MINUTES_CAP = 1_440

/**
 * Tolerancia de desfase de reloj hacia el FUTURO, en segundos. NO es
 * configurable: es presupuesto de desfase entre nodos del API, no una perilla
 * de negocio. Sin esta cota, un `person_created_at` futuro ensancharía la
 * ventana en vez de cerrarla.
 */
export const PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS = 120

function saturate(value: number, min: number, max: number, variable: string): number {
  const saturated = Math.min(Math.max(value, min), max)
  if (saturated !== value) {
    logger.warn(
      { variable, configured: value, applied: saturated, min, max },
      'Valor de configuración fuera del intervalo permitido; se aplica el tope de código.'
    )
  }
  return saturated
}

/**
 * Número de configuración, tolerante a que llegue como texto: el esquema de
 * entorno lo valida al arrancar, pero un valor puesto con `env.set` llega crudo.
 */
function readNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * Ventana vigente, en minutos, ya saturada al tope del producto.
 * Se lee en CADA evaluación y no se cachea en módulo.
 */
export function getPersonReleaseWindowMinutes(): number {
  return saturate(
    readNumber(env.get('PERSON_RELEASE_WINDOW_MINUTES'), PERSON_RELEASE_WINDOW_MINUTES_DEFAULT),
    PERSON_RELEASE_WINDOW_MINUTES_MIN,
    PERSON_RELEASE_WINDOW_MINUTES_CAP,
    'PERSON_RELEASE_WINDOW_MINUTES'
  )
}

/**
 * Predicado puro de frescura, acotado por AMBOS lados. Fallo CERRADO: una fecha
 * ausente, inválida o en el futuro más allá de la tolerancia no es liberable.
 *
 * `person_created_at` es `notNullable` y `autoCreate` (`app/models/person.ts`),
 * así que el caso nulo solo se alcanza con datos corruptos — y ante la duda no
 * se libera. La cota superior existe porque un timestamp futuro ensancharía la
 * ventana: es la dirección peligrosa del sesgo.
 */
export function isWithinPersonReleaseWindow(createdAt: DateTime | null | undefined): boolean {
  if (!createdAt || !createdAt.isValid) {
    return false
  }

  const ageInMinutes = DateTime.now().diff(createdAt, 'minutes').minutes
  if (!Number.isFinite(ageInMinutes)) {
    return false
  }

  // Edad negativa = fecha en el futuro. Se tolera solo el desfase de reloj.
  const futureToleranceInMinutes = PERSON_RELEASE_FUTURE_TOLERANCE_SECONDS / 60
  if (ageInMinutes < -futureToleranceInMinutes) {
    return false
  }

  return ageInMinutes <= getPersonReleaseWindowMinutes()
}
