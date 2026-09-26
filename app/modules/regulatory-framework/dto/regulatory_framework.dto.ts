/**
 * DTOs del módulo regulatory-framework (USRH1785167064404).
 *
 * Cada tipo `*Raw` representa el dato crudo (con claves i18n sin resolver)
 * que devuelve el repository; el controller resuelve las claves al idioma
 * del request antes de responder. El caché guarda siempre la forma `Raw`
 * para ser locale-safe (la resolución i18n ocurre por request, nunca en el
 * dato cacheado).
 */

// ─── Autoridades ──────────────────────────────────────────────────────────

/** Fila de autoridad para el listado (`GET /regulatory-authorities`). */
export interface RegulatoryAuthorityListRow {
  id: number
  slug: string
  shortName: string
  fullName: string
  countryCode: string
  jurisdiction: 'federal' | 'local' | 'estatal'
  /** Clave i18n sin resolver; puede ser `null`. */
  descriptionKey: string | null
  website: string | null
  icon: string | null
  brandColor: string | null
  regulationsCount: number
}

/** Norma embebida en el detalle de una autoridad. */
export interface RegulationSummaryInAuthority {
  id: number
  code: string
  title: string
  type: 'NOM' | 'NMX' | 'LEY' | 'REGLAMENTO' | 'ACUERDO' | 'RESOLUCION'
  version: string
  status: 'vigente' | 'modificada' | 'derogada'
  publicationDate: string
  effectiveDate: string
  lastRevisionDate: string | null
  /** Clave i18n sin resolver; puede ser `null`. */
  scopeDescriptionKey: string | null
  officialUrl: string | null
}

/** Detalle de una autoridad con sus normas (`GET /regulatory-authorities/:slug`). */
export interface RegulatoryAuthorityDetailRaw {
  id: number
  slug: string
  shortName: string
  fullName: string
  countryCode: string
  jurisdiction: 'federal' | 'local' | 'estatal'
  descriptionKey: string | null
  auditDescriptionKey: string | null
  website: string | null
  icon: string | null
  brandColor: string | null
  regulations: RegulationSummaryInAuthority[]
}

// ─── Normas / árbol de numerales ──────────────────────────────────────────

/** Autoridad embebida en la respuesta de una norma. */
export interface RegulatoryAuthorityRef {
  id: number
  slug: string
  shortName: string
}

/** Nodo crudo del árbol de numerales, ya anidado por jerarquía padre-hijo. */
export interface RegulationClauseTreeNodeRaw {
  id: number
  code: string
  ord: number
  parentId: number | null
  titleKey: string | null
  obligationKey: string
  explanationKey: string
  rationaleKey: string
  auditCriteriaKey: string
  applicabilityKey: string | null
  children: RegulationClauseTreeNodeRaw[]
}

/** Respuesta cruda de `GET /regulations/:code`. */
export interface RegulationDetailRaw {
  id: number
  code: string
  title: string
  type: 'NOM' | 'NMX' | 'LEY' | 'REGLAMENTO' | 'ACUERDO' | 'RESOLUCION'
  version: string
  status: 'vigente' | 'modificada' | 'derogada'
  publicationDate: string
  effectiveDate: string
  lastRevisionDate: string | null
  scopeDescriptionKey: string | null
  generalAuditDescriptionKey: string | null
  officialUrl: string | null
  retentionMinYears: number | null
  authority: RegulatoryAuthorityRef
  clausesTree: RegulationClauseTreeNodeRaw[]
}

// ─── Detalle de numeral ───────────────────────────────────────────────────

/** Norma embebida en el detalle de un numeral. */
export interface RegulationRefInClause {
  id: number
  code: string
  title: string
  version: string
}

/** Numeral padre o hijo directo, forma corta (sin recursión). */
export interface RegulationClauseRef {
  id: number
  code: string
  ord: number
  titleKey: string | null
}

/** Módulo del sistema al que pertenece una feature. */
export interface FeatureModuleInfo {
  id: number
  name: string
  slug: string
}

/**
 * Feature del producto vinculada a un numeral, con su `systemFeature` y
 * módulo embebidos.
 *
 * NOTA DE DRIFT (verificado contra BD real 2026-07-28): la migración
 * `1779739784373_replace_regulation_clause_features_with_fk` reemplazó la
 * tabla `regulation_clause_features` por una versión más simple (solo FK +
 * `coverage` + `note_key`); las columnas `slug`, `module`, `status` y
 * `available_since` que aún declara `app/models/regulation_clause_feature.ts`
 * ya no existen en la BD — el modelo quedó desactualizado tras esa
 * migración. Esta HU no migra ni corrige ese modelo (fuera de alcance); el
 * repository de este módulo consulta directo contra las columnas reales
 * (coverage + note_key) y deriva slug/módulo/estado desde `system_features`
 * + `system_modules`, que sí son la fuente de verdad vigente.
 */
export interface RegulationClauseFeatureRaw {
  id: number
  coverage: 'total' | 'parcial' | null
  /** Clave i18n sin resolver; puede ser `null`. */
  noteKey: string | null
  systemFeature: {
    id: number
    name: string
    slug: string
    status: 'planeado' | 'en_desarrollo' | 'disponible' | 'deprecado'
  }
  module: FeatureModuleInfo
}

/** Evidencia esperada para acreditar el cumplimiento de un numeral. */
export interface RegulationEvidenceRequirementRaw {
  id: number
  type: 'documento' | 'registro' | 'bitacora' | 'reporte' | 'formulario'
  /** Clave i18n sin resolver. */
  descriptionKey: string
  retentionYears: number
}

/** Respuesta cruda de `GET /regulations/:code/clauses/:clauseCode`. */
export interface RegulationClauseDetailRaw {
  id: number
  code: string
  ord: number
  regulation: RegulationRefInClause
  titleKey: string | null
  obligationKey: string
  explanationKey: string
  rationaleKey: string
  auditCriteriaKey: string
  applicabilityKey: string | null
  parent: RegulationClauseRef | null
  children: RegulationClauseRef[]
  features: RegulationClauseFeatureRaw[]
  evidenceRequirements: RegulationEvidenceRequirementRaw[]
}

/** Fila mínima usada por el helper de árbol y por las consultas de jerarquía. */
export interface RegulationClauseRow {
  id: number
  parentId: number | null
  code: string
  ord: number
  titleKey: string | null
  obligationKey: string
  explanationKey: string
  rationaleKey: string
  auditCriteriaKey: string
  applicabilityKey: string | null
}
