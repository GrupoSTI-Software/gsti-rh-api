import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@adonisjs/core/services/logger'
import {
  TENANT_UNSCOPED_REASON_POLICY,
  isTenantUnscopedReason,
  type TenantUnscopedReason,
} from '#constants/tenant_unscoped_reason'

interface TenantStore {
  /** IDs de unidades de negocio accesibles en la request actual. */
  scope: number[]
  /** true cuando se activa runUnscoped: los mixins omiten el whereIn. */
  bypassed: boolean
}

const storage = new AsyncLocalStorage<TenantStore>()

function runUnscopedImpl<T>(fn: () => T, reason: string, detail?: string): T {
  if (isTenantUnscopedReason(reason)) {
    const policy = TENANT_UNSCOPED_REASON_POLICY[reason]
    const payload =
      detail === undefined
        ? { reason, origin: policy.origin }
        : { reason, origin: policy.origin, detail }
    logger[policy.logLevel](
      payload,
      'TenantContext.runUnscoped: excepción declarada al filtro de empresa'
    )
  } else {
    logger.debug(
      { reason: 'legacy' },
      'TenantContext.runUnscoped: motivo heredado sin catálogo'
    )
  }
  return storage.run({ scope: [], bypassed: true }, fn)
}

function runUnscoped<T>(fn: () => T, reason: TenantUnscopedReason, detail?: string): T
/**
 * @deprecated Texto libre: solo para pruebas heredadas mientras R3 las migra.
 * En app/ y commands/ lo prohíbe tests/unit/constants/tenant_unscoped_reason_contract.spec.ts.
 */
function runUnscoped<T>(fn: () => T, reason: string, detail?: string): T
function runUnscoped<T>(fn: () => T, reason: string, detail?: string): T {
  return runUnscopedImpl(fn, reason, detail)
}

/**
 * Contexto request-scoped de tenant basado en AsyncLocalStorage.
 *
 * Expone el scope (business_unit_id[]) a los modelos estáticos de Lucid
 * durante toda la cadena de la request, incluyendo awaits anidados, sin
 * necesidad de pasar el scope como parámetro en cada capa.
 *
 * ## Flujo normal (vía middleware)
 * ```
 * TenantContext.run(scope, () => next())
 * ```
 *
 * ## Bypass auditado
 * ```
 * TenantContext.runUnscoped(() => next(), TENANT_UNSCOPED_REASON.PLATFORM_ADMIN)
 * ```
 *
 * ## Lectura desde modelos / servicios
 * ```
 * const scope = TenantContext.getScope()   // number[]
 * const bypassed = TenantContext.isBypassed()
 * ```
 */
export const TenantContext = {
  /**
   * Devuelve el scope activo para la request en curso.
   * Retorna array vacío si no hay contexto activo (p. ej. en procesos sin request).
   */
  getScope(): number[] {
    return storage.getStore()?.scope ?? []
  },

  /**
   * Indica si el contexto actual está en modo bypass (runUnscoped fue llamado).
   * Cuando es true, el mixin withBusinessUnitScope omite el filtro whereIn.
   */
  isBypassed(): boolean {
    return storage.getStore()?.bypassed ?? false
  },

  /**
   * Indica si hay un contexto activo (run o runUnscoped fue invocado en la cadena).
   * Cuando es false significa que no pasó por el middleware de scope (p. ej. rutas
   * públicas o tests sin middleware): los mixins no aplican ningún filtro.
   */
  isActive(): boolean {
    return storage.getStore() !== undefined
  },

  /**
   * Ejecuta fn con el scope dado activo en toda la cadena async descendente.
   * Úsalo desde el middleware para propagar el scope al resto de la request.
   */
  run<T>(scope: number[], fn: () => T): T {
    return storage.run({ scope, bypassed: false }, fn)
  },

  /**
   * Ejecuta fn sin filtro de empresa para todos los modelos con withBusinessUnitScope.
   *
   * Se usa solo en: consola de la plataforma, procesos programados, comandos, seeders,
   * pruebas y las excepciones HTTP catalogadas. NUNCA por rol de empresa (root, dueño o
   * super-administrador): esos roles saltan permisos, no el filtro de empresa.
   *
   * Un TenantContext.run() anidado reemplaza este contexto y apaga el bypass en esa rama.
   */
  runUnscoped,
}
