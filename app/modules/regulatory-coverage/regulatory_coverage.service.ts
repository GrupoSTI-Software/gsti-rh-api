import type { RegulatoryCoverageRepository } from './regulatory_coverage.repository.js'
import type {
  RegulationCoverageRow,
  RegulatoryCoverageSummaryResponse,
  RegulationDetailResponse,
} from './dto/regulatory_coverage.dto.js'
import RegulatoryCoverageRepositoryMysql from './regulatory_coverage.repository.mysql.js'

/** Tiempo de vida del caché en milisegundos (5 minutos). */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Entrada genérica del caché en memoria. */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Servicio de cobertura regulatoria.
 *
 * Expone tres operaciones de lectura:
 * - `getCoverage` : cobertura por norma considerando solo features `disponible`.
 * - `getSummary`  : resumen cross-norma con desglose por bucket acumulativo
 *                   (disponible / en_desarrollo / planeado).
 * - `getDetail`   : detalle completo de una norma: cabecera + numerales hoja con
 *                   sus features no-deprecadas y módulos. Caché por regulationId.
 *
 * Cada operación tiene su propio caché en memoria con TTL de 5 minutos.
 * El dato cambia solo cuando se actualizan mapeos, statuses de features o el
 * catálogo de normas (vía seeders/admin), por lo que 5 minutos es suficiente.
 */
export default class RegulatoryCoverageService {
  private repo: RegulatoryCoverageRepository
  private coverageCache: CacheEntry<RegulationCoverageRow[]> | null = null
  private summaryCache: CacheEntry<RegulatoryCoverageSummaryResponse> | null = null
  private detailCache = new Map<number, CacheEntry<RegulationDetailResponse>>()

  constructor(repo?: RegulatoryCoverageRepository) {
    this.repo = repo ?? new RegulatoryCoverageRepositoryMysql()
  }

  /**
   * Devuelve la cobertura de todas las normas vigentes (solo bucket `disponible`).
   * Utiliza el caché del endpoint por-norma si los datos aún están vigentes.
   */
  async getCoverage(): Promise<RegulationCoverageRow[]> {
    if (this.coverageCache && Date.now() < this.coverageCache.expiresAt) {
      return this.coverageCache.data
    }

    const data = await this.repo.getCoverageByRegulation()
    this.coverageCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  }

  /**
   * Devuelve el resumen de cobertura con desglose por bucket acumulativo.
   * Utiliza un caché propio, independiente del caché del endpoint por-norma.
   */
  async getSummary(): Promise<RegulatoryCoverageSummaryResponse> {
    if (this.summaryCache && Date.now() < this.summaryCache.expiresAt) {
      return this.summaryCache.data
    }

    const data = await this.repo.getCoverageSummary()
    this.summaryCache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
    return data
  }

  /**
   * Devuelve el detalle completo de una norma vigente: cabecera con conteos
   * consistentes con `getCoverage` y el listado de numerales hoja con las
   * features no-deprecadas mapeadas y su módulo.
   *
   * Devuelve `null` cuando la norma no existe, está soft-deleted o no es vigente.
   * El resultado se cachea por `regulationId` con TTL de 5 minutos.
   */
  async getDetail(regulationId: number): Promise<RegulationDetailResponse | null> {
    const cached = this.detailCache.get(regulationId)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.repo.getRegulationDetail(regulationId)
    if (data !== null) {
      this.detailCache.set(regulationId, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    }
    return data
  }

  /**
   * Invalida todos los cachés manualmente. Útil para pruebas o cuando un proceso
   * admin actualiza el catálogo y quiere reflejar los cambios de inmediato.
   */
  invalidateCache(): void {
    this.coverageCache = null
    this.summaryCache = null
    this.detailCache.clear()
  }
}
