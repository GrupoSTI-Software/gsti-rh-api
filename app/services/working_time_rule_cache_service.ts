import type { EffectiveRuleResult } from '#modules/working-time-rules/effective/dto/effective.dto'

/** Tamaño máximo de entradas en caché antes de empezar a desalojar (FIFO). */
const CACHE_MAX_SIZE = 5000

/**
 * TTL de cada entrada (1 hora). Red de seguridad ante cambios que no pasen por el
 * CRUD de overrides. La invalidación activa por empresa es la vía principal.
 *
 * NOTA DE OPERACIÓN: si en el futuro se observa staleness, bajar este valor; si se
 * observa presión de memoria/latencia, subirlo. Documentado en el ticket.
 */
const CACHE_TTL_MS = 60 * 60 * 1000

/** Entrada cacheada: el resultado resuelto (puede tener effective null) + sello de tiempo. */
interface CacheEntry {
  value: EffectiveRuleResult
  timestamp: number
}

/**
 * Caché en memoria de la jornada efectiva por (empresa, país, fecha).
 *
 * Sigue el patrón de `face_descriptor_cache_service.ts`: Map con TTL y tope de tamaño.
 * La clave incluye el businessUnitId para poder invalidar por empresa cuando su CRUD
 * de overrides cambia. Las reglas federales no se cachean aquí de forma global: cada
 * empresa cachea su propia resolución (que puede caer en el federal), por lo que un
 * cambio federal se cubre con el TTL.
 */
class WorkingTimeRuleCacheService {
  private readonly cache: Map<string, CacheEntry> = new Map()
  private readonly maxSize: number = CACHE_MAX_SIZE
  private readonly ttlMs: number = CACHE_TTL_MS

  /** Construye la clave compuesta de la caché. */
  private buildKey(businessUnitId: number, countryCode: string, date: string): string {
    return `${businessUnitId}|${countryCode}|${date}`
  }

  /**
   * Devuelve el resultado cacheado o `undefined` si no hay entrada válida.
   * Un resultado con `effective: null` (jornada no resuelta) también se cachea.
   */
  get(businessUnitId: number, countryCode: string, date: string): EffectiveRuleResult | undefined {
    const key = this.buildKey(businessUnitId, countryCode, date)
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const isExpired = Date.now() - entry.timestamp > this.ttlMs
    if (isExpired) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  /** Almacena el resultado resuelto para (empresa, país, fecha). */
  set(
    businessUnitId: number,
    countryCode: string,
    date: string,
    value: EffectiveRuleResult
  ): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }

    const key = this.buildKey(businessUnitId, countryCode, date)
    this.cache.set(key, { value, timestamp: Date.now() })
  }

  /**
   * Invalida todas las entradas de una empresa. Se llama desde el CRUD de overrides
   * (create/update/delete) para que la siguiente consulta refleje el cambio.
   */
  invalidateBusinessUnit(businessUnitId: number): void {
    const prefix = `${businessUnitId}|`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /** Vacía toda la caché (útil ante cambios federales o en tests). */
  flushAll(): void {
    this.cache.clear()
  }

  /** Estadísticas para diagnóstico. */
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return { size: this.cache.size, maxSize: this.maxSize, ttlMs: this.ttlMs }
  }
}

/** Instancia singleton compartida en el proceso. */
export const workingTimeRuleCache = new WorkingTimeRuleCacheService()
export default WorkingTimeRuleCacheService
