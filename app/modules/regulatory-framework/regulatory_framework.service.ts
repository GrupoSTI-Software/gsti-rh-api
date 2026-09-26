import type { RegulatoryFrameworkRepository } from './regulatory_framework.repository.js'
import type {
  RegulatoryAuthorityListRow,
  RegulatoryAuthorityDetailRaw,
  RegulationDetailRaw,
  RegulationClauseDetailRaw,
  RegulationRefInClause,
} from './dto/regulatory_framework.dto.js'
import RegulatoryFrameworkRepositoryMysql from './regulatory_framework.repository.mysql.js'
import { RegulatoryFrameworkError } from '#exceptions/regulatory_framework_error'
import { REGULATORY_FRAMEWORK_ERROR_CODES } from '#constants/regulatory_framework_error_codes'

/**
 * Tiempo de vida del caché en milisegundos (5 minutos, espejo exacto de
 * `regulatory-coverage`). Abierto a subir a ~1h en review (cambio de
 * constante, no de diseño).
 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** Entrada genérica del caché en memoria. */
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

/**
 * Servicio de consulta del marco regulatorio (USRH1785167064404).
 *
 * Orquesta el repositorio y cachea las respuestas en memoria (TTL 5 min)
 * **sin resolver i18n** — el dato cacheado guarda siempre las claves crudas,
 * y la resolución al idioma del usuario ocurre en el controller por
 * request, para que el mismo caché sirva a cualquier locale sin meter el
 * locale en la clave (locale-safety del caché).
 *
 * Solo lectura: ningún método muta el catálogo (el catálogo se mantiene
 * únicamente por seeders de GSTI).
 */
export default class RegulatoryFrameworkService {
  private repo: RegulatoryFrameworkRepository
  private authoritiesCache = new Map<string, CacheEntry<RegulatoryAuthorityListRow[]>>()
  private authorityDetailCache = new Map<string, CacheEntry<RegulatoryAuthorityDetailRaw>>()
  private regulationCache = new Map<string, CacheEntry<RegulationDetailRaw>>()
  private clauseCache = new Map<string, CacheEntry<RegulationClauseDetailRaw>>()

  constructor(repo?: RegulatoryFrameworkRepository) {
    this.repo = repo ?? new RegulatoryFrameworkRepositoryMysql()
  }

  /** Lista las autoridades activas ordenadas por `shortName`, con su conteo de normas. */
  async listAuthorities(
    countryCode: string,
    hasRegulations: boolean | undefined
  ): Promise<RegulatoryAuthorityListRow[]> {
    const cacheKey = `${countryCode}:${hasRegulations ?? 'all'}`
    const cached = this.authoritiesCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.repo.listAuthorities(countryCode, hasRegulations)
    this.authoritiesCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  /**
   * Detalle de una autoridad con sus normas embebidas.
   * @throws {RegulatoryFrameworkError} `REG.NF.001` si el slug no existe/no está activa.
   */
  async getAuthorityBySlug(slug: string): Promise<RegulatoryAuthorityDetailRaw> {
    const cached = this.authorityDetailCache.get(slug)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.repo.findAuthorityBySlug(slug)
    if (!data) {
      throw RegulatoryFrameworkError.withMessageKey(
        'regulatory_framework_authority_not_found',
        REGULATORY_FRAMEWORK_ERROR_CODES.AUTHORITY_NOT_FOUND,
        404,
        'autoridad-no-encontrada',
        'La autoridad reguladora solicitada no existe o no está activa.'
      )
    }

    this.authorityDetailCache.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  /**
   * Norma completa con su árbol de numerales anidado.
   * @throws {RegulatoryFrameworkError} `REG.NF.002` si el código no existe.
   */
  async getRegulationByCode(code: string): Promise<RegulationDetailRaw> {
    const cached = this.regulationCache.get(code)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const data = await this.repo.findRegulationByCode(code)
    if (!data) {
      throw RegulatoryFrameworkError.withMessageKey(
        'regulatory_framework_regulation_not_found',
        REGULATORY_FRAMEWORK_ERROR_CODES.REGULATION_NOT_FOUND,
        404,
        'norma-no-encontrada',
        'La norma solicitada no existe en el catálogo regulatorio.'
      )
    }

    this.regulationCache.set(code, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  /**
   * Referencia ligera de una norma por código, para el existence-check de
   * los endpoints de numeral. No se cachea aparte (el hot-path cacheado es
   * el detalle del numeral en sí).
   * @throws {RegulatoryFrameworkError} `REG.NF.002` si el código no existe.
   */
  async requireRegulationRef(code: string): Promise<RegulationRefInClause> {
    const ref = await this.repo.findRegulationRefByCode(code)
    if (!ref) {
      throw RegulatoryFrameworkError.withMessageKey(
        'regulatory_framework_regulation_not_found',
        REGULATORY_FRAMEWORK_ERROR_CODES.REGULATION_NOT_FOUND,
        404,
        'norma-no-encontrada',
        'La norma solicitada no existe en el catálogo regulatorio.'
      )
    }
    return ref
  }

  /**
   * Detalle de un numeral: texto oficial, jerarquía directa, features y
   * evidencia esperada.
   * @throws {RegulatoryFrameworkError} `REG.NF.002` si la norma no existe;
   *   `REG.NF.003` si el numeral no existe o no pertenece a esa norma.
   */
  async getClauseDetail(
    regulationCode: string,
    clauseCode: string
  ): Promise<RegulationClauseDetailRaw> {
    const cacheKey = `${regulationCode}:${clauseCode}`
    const cached = this.clauseCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) return cached.data

    const regulation = await this.requireRegulationRef(regulationCode)
    const data = await this.repo.findClauseDetail(regulation, clauseCode)
    if (!data) {
      throw RegulatoryFrameworkError.withMessageKey(
        'regulatory_framework_clause_not_found',
        REGULATORY_FRAMEWORK_ERROR_CODES.CLAUSE_NOT_FOUND,
        404,
        'numeral-no-encontrado',
        'El numeral solicitado no existe en la norma indicada.'
      )
    }

    this.clauseCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  }

  /**
   * Invalida todos los cachés manualmente. Útil para pruebas o cuando un
   * proceso admin/seed actualiza el catálogo y quiere reflejar los cambios
   * de inmediato (en producción, un simple reinicio también los limpia).
   */
  invalidateCache(): void {
    this.authoritiesCache.clear()
    this.authorityDetailCache.clear()
    this.regulationCache.clear()
    this.clauseCache.clear()
  }
}
