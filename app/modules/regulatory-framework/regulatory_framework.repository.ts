import type {
  RegulatoryAuthorityListRow,
  RegulatoryAuthorityDetailRaw,
  RegulationDetailRaw,
  RegulationClauseDetailRaw,
  RegulationRefInClause,
} from './dto/regulatory_framework.dto.js'

/**
 * Contrato del repositorio de consulta del marco regulatorio
 * (USRH1785167064404). Solo lectura: ningún método de escritura — garantía
 * estructural de que este canal no puede mutar el catálogo.
 *
 * Todos los métodos devuelven la forma "cruda" (claves i18n sin resolver);
 * la resolución al idioma del request ocurre en el controller, nunca aquí.
 */
export interface RegulatoryFrameworkRepository {
  /**
   * Lista las autoridades activas (`regulatoryAuthorityIsActive = 1`,
   * sin soft-delete), con el conteo de normas de cada una.
   *
   * @param countryCode Código de país a filtrar (default `MX`).
   * @param hasRegulations Si se define, filtra por `regulationsCount > 0`
   *   (`true`) o `= 0` (`false`).
   */
  listAuthorities(
    countryCode: string,
    hasRegulations: boolean | undefined
  ): Promise<RegulatoryAuthorityListRow[]>

  /**
   * Detalle de una autoridad por slug, con sus normas embebidas.
   * @returns `null` si el slug no existe, está inactiva o soft-deleted.
   */
  findAuthorityBySlug(slug: string): Promise<RegulatoryAuthorityDetailRaw | null>

  /**
   * Detalle completo de una norma por su código exacto (`regulationCode`),
   * con el árbol de numerales ya anidado.
   * @returns `null` si el código no existe o está soft-deleted.
   */
  findRegulationByCode(code: string): Promise<RegulationDetailRaw | null>

  /**
   * Referencia ligera de una norma por código (`id, code, title, version`),
   * sin el árbol de numerales. Usada para el existence-check y el embed
   * `regulation` de `findClauseDetail` sin pagar el costo de armar el árbol.
   * @returns `null` si el código no existe o está soft-deleted.
   */
  findRegulationRefByCode(code: string): Promise<RegulationRefInClause | null>

  /**
   * Detalle de un numeral dentro de una norma ya confirmada existente:
   * texto oficial, jerarquía directa (padre/hijos), features del producto
   * y evidencia esperada.
   * @returns `null` si el numeral no existe o no pertenece a esa norma.
   */
  findClauseDetail(
    regulation: RegulationRefInClause,
    clauseCode: string
  ): Promise<RegulationClauseDetailRaw | null>
}
