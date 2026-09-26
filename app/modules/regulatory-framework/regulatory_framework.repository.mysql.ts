import db from '@adonisjs/lucid/services/db'
import type { RegulatoryFrameworkRepository } from './regulatory_framework.repository.js'
import type {
  RegulatoryAuthorityListRow,
  RegulatoryAuthorityDetailRaw,
  RegulationSummaryInAuthority,
  RegulationDetailRaw,
  RegulationClauseDetailRaw,
  RegulationClauseRow,
  RegulationRefInClause,
  RegulationClauseRef,
  RegulationClauseFeatureRaw,
  RegulationEvidenceRequirementRaw,
} from './dto/regulatory_framework.dto.js'
import { buildClauseTree } from './regulatory_framework.tree.js'

/**
 * Implementación MySQL del repositorio de consulta del marco regulatorio.
 *
 * Toda query filtra `deleted_at IS NULL` explícitamente (Lucid/db no lo hace
 * solo fuera del query builder de un modelo con `SoftDeletes`). Todo
 * parámetro de usuario (`slug`, `code`, `clauseCode`) va por bindings del
 * query builder — nunca interpolado en SQL crudo.
 */
export default class RegulatoryFrameworkRepositoryMysql implements RegulatoryFrameworkRepository {
  async listAuthorities(
    countryCode: string,
    hasRegulations: boolean | undefined
  ): Promise<RegulatoryAuthorityListRow[]> {
    const rows = await db
      .from('regulatory_authorities as ra')
      .leftJoin('regulations as r', (join) => {
        join.on('r.regulatory_authority_id', 'ra.regulatory_authority_id').andOnNull('r.deleted_at')
      })
      .whereNull('ra.deleted_at')
      .where('ra.regulatory_authority_is_active', 1)
      .where('ra.regulatory_authority_country_code', countryCode)
      .groupBy('ra.regulatory_authority_id')
      .orderBy('ra.regulatory_authority_short_name', 'asc')
      .select(
        'ra.regulatory_authority_id as id',
        'ra.regulatory_authority_slug as slug',
        'ra.regulatory_authority_short_name as short_name',
        'ra.regulatory_authority_full_name as full_name',
        'ra.regulatory_authority_country_code as country_code',
        'ra.regulatory_authority_jurisdiction as jurisdiction',
        'ra.regulatory_authority_description_key as description_key',
        'ra.regulatory_authority_website as website',
        'ra.regulatory_authority_icon as icon',
        'ra.regulatory_authority_brand_color as brand_color'
      )
      .count('r.regulation_id as regulations_count')

    const mapped: RegulatoryAuthorityListRow[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      shortName: row.short_name,
      fullName: row.full_name,
      countryCode: row.country_code,
      jurisdiction: row.jurisdiction,
      descriptionKey: row.description_key,
      website: row.website,
      icon: row.icon,
      brandColor: row.brand_color,
      regulationsCount: Number(row.regulations_count),
    }))

    // Filtro post-agregación en memoria: el conjunto es pequeño (catálogo
    // de autoridades) y evita depender de HAVING sobre alias agregados,
    // cuya compatibilidad varía entre motores/versión de knex.
    if (hasRegulations === undefined) return mapped
    return mapped.filter((row) =>
      hasRegulations ? row.regulationsCount > 0 : row.regulationsCount === 0
    )
  }

  async findAuthorityBySlug(slug: string): Promise<RegulatoryAuthorityDetailRaw | null> {
    const authority = await db
      .from('regulatory_authorities')
      .whereNull('deleted_at')
      .where('regulatory_authority_is_active', 1)
      .where('regulatory_authority_slug', slug)
      .first()

    if (!authority) return null

    const regulationRows = await db
      .from('regulations')
      .whereNull('deleted_at')
      .where('regulatory_authority_id', authority.regulatory_authority_id)
      .orderBy('regulation_id', 'asc')
      .select(
        'regulation_id as id',
        'regulation_code as code',
        'regulation_title as title',
        'regulation_type as type',
        'regulation_version as version',
        'regulation_status as status',
        'regulation_publication_date as publication_date',
        'regulation_effective_date as effective_date',
        'regulation_last_revision_date as last_revision_date',
        'regulation_scope_description_key as scope_description_key',
        'regulation_official_url as official_url'
      )

    const regulations: RegulationSummaryInAuthority[] = regulationRows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      type: row.type,
      version: row.version,
      status: row.status,
      publicationDate: formatDate(row.publication_date) ?? '',
      effectiveDate: formatDate(row.effective_date) ?? '',
      lastRevisionDate: formatDate(row.last_revision_date),
      scopeDescriptionKey: row.scope_description_key,
      officialUrl: row.official_url,
    }))

    return {
      id: authority.regulatory_authority_id,
      slug: authority.regulatory_authority_slug,
      shortName: authority.regulatory_authority_short_name,
      fullName: authority.regulatory_authority_full_name,
      countryCode: authority.regulatory_authority_country_code,
      jurisdiction: authority.regulatory_authority_jurisdiction,
      descriptionKey: authority.regulatory_authority_description_key,
      auditDescriptionKey: authority.regulatory_authority_audit_description_key,
      website: authority.regulatory_authority_website,
      icon: authority.regulatory_authority_icon,
      brandColor: authority.regulatory_authority_brand_color,
      regulations,
    }
  }

  async findRegulationByCode(code: string): Promise<RegulationDetailRaw | null> {
    const reg = await this.fetchRegulationHeaderByCode(code)
    if (!reg) return null

    const clauseRows = await this.fetchClauseRows(reg.id)

    return {
      id: reg.id,
      code: reg.code,
      title: reg.title,
      type: reg.type,
      version: reg.version,
      status: reg.status,
      publicationDate: reg.publicationDate,
      effectiveDate: reg.effectiveDate,
      lastRevisionDate: reg.lastRevisionDate,
      scopeDescriptionKey: reg.scopeDescriptionKey,
      generalAuditDescriptionKey: reg.generalAuditDescriptionKey,
      officialUrl: reg.officialUrl,
      retentionMinYears: reg.retentionMinYears,
      authority: reg.authority,
      clausesTree: buildClauseTree(clauseRows),
    }
  }

  async findRegulationRefByCode(code: string): Promise<RegulationRefInClause | null> {
    const reg = await this.fetchRegulationHeaderByCode(code)
    if (!reg) return null
    return { id: reg.id, code: reg.code, title: reg.title, version: reg.version }
  }

  async findClauseDetail(
    regulation: RegulationRefInClause,
    clauseCode: string
  ): Promise<RegulationClauseDetailRaw | null> {
    const clause = await db
      .from('regulation_clauses')
      .whereNull('deleted_at')
      .where('regulation_id', regulation.id)
      .where('regulation_clause_code', clauseCode)
      .first()

    if (!clause) return null

    const [parentRow, childrenRows, featureRows, evidenceRows] = await Promise.all([
      clause.parent_regulation_clause_id
        ? db
            .from('regulation_clauses')
            .whereNull('deleted_at')
            .where('regulation_clause_id', clause.parent_regulation_clause_id)
            .select('regulation_clause_id as id', 'regulation_clause_code as code', 'regulation_clause_ord as ord', 'regulation_clause_title_key as title_key')
            .first()
        : Promise.resolve(null),
      db
        .from('regulation_clauses')
        .whereNull('deleted_at')
        .where('parent_regulation_clause_id', clause.regulation_clause_id)
        .orderBy('regulation_clause_ord', 'asc')
        .select('regulation_clause_id as id', 'regulation_clause_code as code', 'regulation_clause_ord as ord', 'regulation_clause_title_key as title_key'),
      // NOTA DE DRIFT (ver dto/regulatory_framework.dto.ts): `regulation_clause_features`
      // ya no tiene `slug`/`module`/`status`/`available_since` (columnas removidas por
      // la migración `1779739784373`); solo quedan `coverage` y `note_key`. slug/estado
      // se leen de `system_features` (fuente de verdad vigente) y el módulo, de `system_modules`.
      db
        .from('regulation_clause_features as rcf')
        .join('system_features as sf', 'sf.system_feature_id', 'rcf.system_feature_id')
        .join('system_modules as sm', (join) => {
          join
            .on('sm.system_module_id', 'sf.system_module_id')
            .andOnNull('sm.system_module_deleted_at')
        })
        .whereNull('rcf.deleted_at')
        .whereNull('sf.deleted_at')
        .where('rcf.regulation_clause_id', clause.regulation_clause_id)
        .orderBy('rcf.regulation_clause_feature_id', 'asc')
        .select(
          'rcf.regulation_clause_feature_id as id',
          'rcf.regulation_clause_feature_coverage as coverage',
          'rcf.regulation_clause_feature_note_key as note_key',
          'sf.system_feature_id as system_feature_id',
          'sf.system_feature_name as system_feature_name',
          'sf.system_feature_slug as system_feature_slug',
          'sf.system_feature_status as system_feature_status',
          'sm.system_module_id as module_id',
          'sm.system_module_name as module_name',
          'sm.system_module_slug as module_slug'
        ),
      db
        .from('regulation_evidence_requirements')
        .whereNull('deleted_at')
        .where('regulation_clause_id', clause.regulation_clause_id)
        .orderBy('regulation_evidence_requirement_id', 'asc')
        .select(
          'regulation_evidence_requirement_id as id',
          'regulation_evidence_requirement_type as type',
          'regulation_evidence_requirement_description_key as description_key',
          'regulation_evidence_requirement_retention_years as retention_years'
        ),
    ])

    const parent: RegulationClauseRef | null = parentRow
      ? { id: parentRow.id, code: parentRow.code, ord: parentRow.ord, titleKey: parentRow.title_key }
      : null

    const children: RegulationClauseRef[] = childrenRows.map((row) => ({
      id: row.id,
      code: row.code,
      ord: row.ord,
      titleKey: row.title_key,
    }))

    const features: RegulationClauseFeatureRaw[] = featureRows.map((row) => ({
      id: row.id,
      coverage: row.coverage,
      noteKey: row.note_key,
      systemFeature: {
        id: row.system_feature_id,
        name: row.system_feature_name,
        slug: row.system_feature_slug,
        status: row.system_feature_status,
      },
      module: {
        id: row.module_id,
        name: row.module_name,
        slug: row.module_slug,
      },
    }))

    const evidenceRequirements: RegulationEvidenceRequirementRaw[] = evidenceRows.map((row) => ({
      id: row.id,
      type: row.type,
      descriptionKey: row.description_key,
      retentionYears: row.retention_years,
    }))

    return {
      id: clause.regulation_clause_id,
      code: clause.regulation_clause_code,
      ord: clause.regulation_clause_ord,
      regulation,
      titleKey: clause.regulation_clause_title_key,
      obligationKey: clause.regulation_clause_obligation_key,
      explanationKey: clause.regulation_clause_explanation_key,
      rationaleKey: clause.regulation_clause_rationale_key,
      auditCriteriaKey: clause.regulation_clause_audit_criteria_key,
      applicabilityKey: clause.regulation_clause_applicability_key,
      parent,
      children,
      features,
      evidenceRequirements,
    }
  }

  /** Cabecera de norma con autoridad embebida; selecciona la fila vigente
   * más reciente cuando (a futuro) hubiera varias filas por el mismo código. */
  private async fetchRegulationHeaderByCode(code: string): Promise<RegulationHeaderRow | null> {
    const row = await db
      .from('regulations as r')
      .join('regulatory_authorities as ra', 'ra.regulatory_authority_id', 'r.regulatory_authority_id')
      .whereNull('r.deleted_at')
      .whereNull('ra.deleted_at')
      .where('r.regulation_code', code)
      .orderByRaw("r.regulation_status = 'vigente' desc")
      .orderBy('r.regulation_version', 'desc')
      .select(
        'r.regulation_id as id',
        'r.regulation_code as code',
        'r.regulation_title as title',
        'r.regulation_type as type',
        'r.regulation_version as version',
        'r.regulation_status as status',
        'r.regulation_publication_date as publication_date',
        'r.regulation_effective_date as effective_date',
        'r.regulation_last_revision_date as last_revision_date',
        'r.regulation_scope_description_key as scope_description_key',
        'r.regulation_general_audit_description_key as general_audit_description_key',
        'r.regulation_official_url as official_url',
        'r.regulation_retention_min_years as retention_min_years',
        'ra.regulatory_authority_id as authority_id',
        'ra.regulatory_authority_slug as authority_slug',
        'ra.regulatory_authority_short_name as authority_short_name'
      )
      .first()

    if (!row) return null

    return {
      id: row.id,
      code: row.code,
      title: row.title,
      type: row.type,
      version: row.version,
      status: row.status,
      publicationDate: formatDate(row.publication_date) ?? '',
      effectiveDate: formatDate(row.effective_date) ?? '',
      lastRevisionDate: formatDate(row.last_revision_date),
      scopeDescriptionKey: row.scope_description_key,
      generalAuditDescriptionKey: row.general_audit_description_key,
      officialUrl: row.official_url,
      retentionMinYears: row.retention_min_years,
      authority: {
        id: row.authority_id,
        slug: row.authority_slug,
        shortName: row.authority_short_name,
      },
    }
  }

  /** Todas las cláusulas de una norma, planas, ordenadas por `ord` (base sana para `buildClauseTree`). */
  private async fetchClauseRows(regulationId: number): Promise<RegulationClauseRow[]> {
    const rows = await db
      .from('regulation_clauses')
      .whereNull('deleted_at')
      .where('regulation_id', regulationId)
      .orderBy('regulation_clause_ord', 'asc')
      .select(
        'regulation_clause_id as id',
        'parent_regulation_clause_id as parent_id',
        'regulation_clause_code as code',
        'regulation_clause_ord as ord',
        'regulation_clause_title_key as title_key',
        'regulation_clause_obligation_key as obligation_key',
        'regulation_clause_explanation_key as explanation_key',
        'regulation_clause_rationale_key as rationale_key',
        'regulation_clause_audit_criteria_key as audit_criteria_key',
        'regulation_clause_applicability_key as applicability_key'
      )

    return rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      code: row.code,
      ord: row.ord,
      titleKey: row.title_key,
      obligationKey: row.obligation_key,
      explanationKey: row.explanation_key,
      rationaleKey: row.rationale_key,
      auditCriteriaKey: row.audit_criteria_key,
      applicabilityKey: row.applicability_key,
    }))
  }
}

/** Fila interna de cabecera de norma (formato de fecha ya normalizado a `yyyy-LL-dd`). */
interface RegulationHeaderRow {
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
  authority: { id: number; slug: string; shortName: string }
}

/** Normaliza una fecha (Date | string | null) a `yyyy-LL-dd`, o `null`. */
function formatDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const str = String(value)
  return str.length >= 10 ? str.slice(0, 10) : str
}
