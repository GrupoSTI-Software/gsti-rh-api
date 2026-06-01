import type { RegulatoryCoverageRepository } from './regulatory_coverage.repository.js'
import type { RegulationCoverageRow } from './dto/regulatory_coverage.dto.js'
import RegulatoryCoverageRepositoryMysql from './regulatory_coverage.repository.mysql.js'

/** Tiempo de vida del caché en milisegundos (5 minutos). */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Entrada del caché en memoria. */
interface CacheEntry {
  data: RegulationCoverageRow[]
  expiresAt: number
}

/**
 * Servicio de cobertura regulatoria.
 *
 * Calcula y expone el porcentaje de cobertura de cada norma vigente
 * considerando únicamente funcionalidades con status `disponible`.
 *
 * Caché en memoria con TTL de 5 minutos. El dato cambia solo cuando:
 * - Se agrega un nuevo mapeo en `regulation_clause_features`.
 * - Se cambia el status de una feature a/desde `disponible`.
 * - Se agrega una norma o numeral nuevo.
 * Estos eventos ocurren vía seeders o admin, no en flujo normal de usuario,
 * por lo que un TTL de 5 minutos es suficiente para el caso de uso.
 */
export default class RegulatoryCoverageService {
  private repo: RegulatoryCoverageRepository
  private cache: CacheEntry | null = null

  constructor(repo?: RegulatoryCoverageRepository) {
    this.repo = repo ?? new RegulatoryCoverageRepositoryMysql()
  }

  /**
   * Devuelve la cobertura de todas las normas vigentes.
   * Utiliza el caché si los datos aún están vigentes.
   */
  async getCoverage(): Promise<RegulationCoverageRow[]> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.data
    }

    const data = await this.repo.getCoverageByRegulation()
    this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  }

  /**
   * Invalida el caché manualmente. Útil para pruebas o cuando un proceso
   * admin actualiza el catálogo y quiere reflejar los cambios de inmediato.
   */
  invalidateCache(): void {
    this.cache = null
  }
}
