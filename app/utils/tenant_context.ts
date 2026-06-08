import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@adonisjs/core/services/logger'

interface TenantStore {
  /** IDs de unidades de negocio accesibles en la request actual. */
  scope: number[]
  /** true cuando se activa runUnscoped: los mixins omiten el whereIn. */
  bypassed: boolean
}

const storage = new AsyncLocalStorage<TenantStore>()

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
 * TenantContext.runUnscoped(() => next(), 'usuario con rol root')
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
   * Ejecuta fn desactivando el filtro de tenant para todos los modelos
   * con el mixin withBusinessUnitScope.
   *
   * **Solo debe usarse en dos casos:**
   * 1. Usuarios con rol root (acceso total sin restricción de tenant).
   * 2. Procesos batch/cron que no tienen usuario HTTP y definen su propio scope.
   *
   * Toda llamada queda registrada en el log con el motivo (`reason`) para auditoría.
   */
  runUnscoped<T>(fn: () => T, reason: string): T {
    logger.warn({ reason }, 'TenantContext.runUnscoped: bypass de filtro tenant activado')
    return storage.run({ scope: [], bypassed: true }, fn)
  },
}
