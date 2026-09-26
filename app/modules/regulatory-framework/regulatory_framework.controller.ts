import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import RegulatoryFrameworkService from './regulatory_framework.service.js'
import { RegulatoryFrameworkError } from '#exceptions/regulatory_framework_error'
import { REGULATORY_FRAMEWORK_ERROR_CODES } from '#constants/regulatory_framework_error_codes'
import type {
  RegulatoryAuthorityListRow,
  RegulatoryAuthorityDetailRaw,
  RegulationSummaryInAuthority,
  RegulationDetailRaw,
  RegulationClauseTreeNodeRaw,
  RegulationClauseDetailRaw,
  RegulationClauseFeatureRaw,
  RegulationEvidenceRequirementRaw,
} from './dto/regulatory_framework.dto.js'

/** `:code` de norma (p. ej. "NOM-035-STPS"). Formato conservador, no negociable (seguridad). */
const REGULATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,63}$/
/** `:clauseCode` de numeral (p. ej. "5.1", "5.8.a"). */
const CLAUSE_CODE_PATTERN = /^[0-9][0-9A-Za-z.]{0,31}$/
/** `country` ISO-2 (p. ej. "MX", "US"). */
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/

/**
 * Controller del módulo regulatory-framework (USRH1785167064404).
 *
 * Expone 5 endpoints GET de solo lectura del catálogo regulatorio
 * (autoridades, normas y árbol de numerales con sus funciones/evidencia).
 * Cero mutación: el archivo de rutas solo declara `router.get(...)`.
 *
 * Todos los textos editoriales llegan resueltos al idioma del request vía
 * `ctx.i18n` (fallback a la clave literal, nunca claves crudas ni 500).
 * El servicio cachea la forma cruda (pre-i18n); la resolución ocurre aquí,
 * por request, para que el caché sea locale-safe.
 */
export default class RegulatoryFrameworkController {
  /**
   * @swagger
   * /api/v1/regulatory-authorities:
   *   get:
   *     summary: Lista las autoridades reguladoras activas
   *     description: |
   *       Devuelve las autoridades reguladoras activas (p. ej. STPS, IMSS),
   *       ordenadas por `shortName` ASC, con el conteo de normas de cada una.
   *       Textos resueltos al idioma del request.
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryFramework
   *     parameters:
   *       - in: query
   *         name: country
   *         schema:
   *           type: string
   *         description: Código ISO-2 de país (default "MX").
   *       - in: query
   *         name: has_regulations
   *         schema:
   *           type: string
   *           enum: [true, false]
   *         description: Filtra por autoridades con (true) o sin (false) normas cargadas.
   *     responses:
   *       200:
   *         description: Lista de autoridades activas
   *       422:
   *         description: Parámetro de consulta inválido (`REG.VAL.001`)
   *       401:
   *         description: No autenticado
   */
  async listAuthorities(ctx: HttpContext) {
    return runListAuthorities(ctx)
  }

  /**
   * @swagger
   * /api/v1/regulatory-authorities/{slug}:
   *   get:
   *     summary: Detalle de una autoridad reguladora con sus normas
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryFramework
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         example: stps
   *     responses:
   *       200:
   *         description: Detalle de la autoridad con sus normas
   *       404:
   *         description: Autoridad no encontrada o inactiva (`REG.NF.001`)
   *       401:
   *         description: No autenticado
   */
  async showAuthority(ctx: HttpContext) {
    return runShowAuthority(ctx)
  }

  /**
   * @swagger
   * /api/v1/regulations/{code}:
   *   get:
   *     summary: Norma completa con su árbol de numerales anidado
   *     description: |
   *       El árbol respeta la jerarquía padre-hijo y el orden oficial de la
   *       norma. Armado en memoria en una sola query de cláusulas (sin
   *       preload recursivo, sin N+1).
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryFramework
   *     parameters:
   *       - in: path
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         example: NOM-035-STPS
   *     responses:
   *       200:
   *         description: Norma con su árbol de numerales
   *       404:
   *         description: Norma no encontrada (`REG.NF.002`)
   *       401:
   *         description: No autenticado
   */
  async showRegulation(ctx: HttpContext) {
    return runShowRegulation(ctx)
  }

  /**
   * @swagger
   * /api/v1/regulations/{code}/clauses/{clauseCode}:
   *   get:
   *     summary: Detalle de un numeral con sus features y evidencia esperada
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryFramework
   *     parameters:
   *       - in: path
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         example: NOM-035-STPS
   *       - in: path
   *         name: clauseCode
   *         required: true
   *         schema:
   *           type: string
   *         example: 5.8.a
   *     responses:
   *       200:
   *         description: Detalle del numeral
   *       404:
   *         description: Norma (`REG.NF.002`) o numeral (`REG.NF.003`) no encontrado
   *       401:
   *         description: No autenticado
   */
  async showClause(ctx: HttpContext) {
    return runShowClause(ctx)
  }

  /**
   * @swagger
   * /api/v1/regulations/{code}/clauses/{clauseCode}/features:
   *   get:
   *     summary: Funciones del producto que cubren un numeral (relación inversa magra)
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - RegulatoryFramework
   *     parameters:
   *       - in: path
   *         name: code
   *         required: true
   *         schema:
   *           type: string
   *         example: NOM-035-STPS
   *       - in: path
   *         name: clauseCode
   *         required: true
   *         schema:
   *           type: string
   *         example: 5.8.a
   *     responses:
   *       200:
   *         description: Numeral (mínimo) y sus features
   *       404:
   *         description: Norma (`REG.NF.002`) o numeral (`REG.NF.003`) no encontrado
   *       401:
   *         description: No autenticado
   */
  async showClauseFeatures(ctx: HttpContext) {
    return runShowClauseFeatures(ctx)
  }
}

// ─── Resolución i18n (server-side, fallback a la clave literal) ───────────

/** `i18n.t(key, undefined, key)`: nunca devuelve `undefined`/`null` al cliente ni lanza 500 por clave faltante. */
function resolveKey(i18n: I18n, key: string): string
function resolveKey(i18n: I18n, key: string | null): string | null
function resolveKey(i18n: I18n, key: string | null): string | null {
  if (key === null) return null
  return i18n.t(key, undefined, key)
}

function toAuthorityListDto(row: RegulatoryAuthorityListRow, i18n: I18n) {
  return {
    id: row.id,
    slug: row.slug,
    shortName: row.shortName,
    fullName: row.fullName,
    countryCode: row.countryCode,
    jurisdiction: row.jurisdiction,
    description: resolveKey(i18n, row.descriptionKey),
    website: row.website,
    icon: row.icon,
    brandColor: row.brandColor,
    regulationsCount: row.regulationsCount,
  }
}

function toRegulationSummaryDto(reg: RegulationSummaryInAuthority, i18n: I18n) {
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
    scopeDescription: resolveKey(i18n, reg.scopeDescriptionKey),
    officialUrl: reg.officialUrl,
  }
}

function toAuthorityDetailDto(authority: RegulatoryAuthorityDetailRaw, i18n: I18n) {
  return {
    id: authority.id,
    slug: authority.slug,
    shortName: authority.shortName,
    fullName: authority.fullName,
    countryCode: authority.countryCode,
    jurisdiction: authority.jurisdiction,
    description: resolveKey(i18n, authority.descriptionKey),
    auditDescription: resolveKey(i18n, authority.auditDescriptionKey),
    website: authority.website,
    icon: authority.icon,
    brandColor: authority.brandColor,
    regulations: authority.regulations.map((reg) => toRegulationSummaryDto(reg, i18n)),
  }
}

function toClauseTreeNodeDto(node: RegulationClauseTreeNodeRaw, i18n: I18n): unknown {
  return {
    id: node.id,
    code: node.code,
    ord: node.ord,
    parentId: node.parentId,
    title: resolveKey(i18n, node.titleKey),
    obligation: resolveKey(i18n, node.obligationKey),
    explanation: resolveKey(i18n, node.explanationKey),
    rationale: resolveKey(i18n, node.rationaleKey),
    auditCriteria: resolveKey(i18n, node.auditCriteriaKey),
    applicability: resolveKey(i18n, node.applicabilityKey),
    children: node.children.map((child) => toClauseTreeNodeDto(child, i18n)),
  }
}

function toRegulationDetailDto(regulation: RegulationDetailRaw, i18n: I18n) {
  return {
    id: regulation.id,
    code: regulation.code,
    title: regulation.title,
    type: regulation.type,
    version: regulation.version,
    status: regulation.status,
    publicationDate: regulation.publicationDate,
    effectiveDate: regulation.effectiveDate,
    lastRevisionDate: regulation.lastRevisionDate,
    scopeDescription: resolveKey(i18n, regulation.scopeDescriptionKey),
    generalAuditDescription: resolveKey(i18n, regulation.generalAuditDescriptionKey),
    officialUrl: regulation.officialUrl,
    retentionMinYears: regulation.retentionMinYears,
    authority: regulation.authority,
    clausesTree: regulation.clausesTree.map((node) => toClauseTreeNodeDto(node, i18n)),
  }
}

function toFeatureDto(feature: RegulationClauseFeatureRaw, i18n: I18n) {
  return {
    id: feature.id,
    coverage: feature.coverage,
    note: resolveKey(i18n, feature.noteKey),
    systemFeature: feature.systemFeature,
    module: feature.module,
  }
}

function toEvidenceRequirementDto(evidence: RegulationEvidenceRequirementRaw, i18n: I18n) {
  return {
    id: evidence.id,
    type: evidence.type,
    description: resolveKey(i18n, evidence.descriptionKey),
    retentionYears: evidence.retentionYears,
  }
}

function toClauseDetailDto(clause: RegulationClauseDetailRaw, i18n: I18n) {
  return {
    id: clause.id,
    code: clause.code,
    ord: clause.ord,
    regulation: clause.regulation,
    title: resolveKey(i18n, clause.titleKey),
    obligation: resolveKey(i18n, clause.obligationKey),
    explanation: resolveKey(i18n, clause.explanationKey),
    rationale: resolveKey(i18n, clause.rationaleKey),
    auditCriteria: resolveKey(i18n, clause.auditCriteriaKey),
    applicability: resolveKey(i18n, clause.applicabilityKey),
    parent: clause.parent
      ? { id: clause.parent.id, code: clause.parent.code, title: resolveKey(i18n, clause.parent.titleKey) }
      : null,
    children: clause.children.map((child) => ({
      id: child.id,
      code: child.code,
      ord: child.ord,
    })),
    features: clause.features.map((feature) => toFeatureDto(feature, i18n)),
    evidenceRequirements: clause.evidenceRequirements.map((ev) => toEvidenceRequirementDto(ev, i18n)),
  }
}

// ─── Errores tipados: {title, detail, key, code} ───────────────────────────

function respondWithError(response: HttpContext['response'], i18n: I18n, error: RegulatoryFrameworkError) {
  return response.status(error.httpStatus).json({
    title: error.messageKey ? i18n.t(error.messageKey, undefined, defaultTitleFor(error)) : defaultTitleFor(error),
    detail: error.detail ?? error.message,
    key: error.key,
    code: error.errorCode,
  })
}

function defaultTitleFor(error: RegulatoryFrameworkError): string {
  switch (error.errorCode) {
    case REGULATORY_FRAMEWORK_ERROR_CODES.AUTHORITY_NOT_FOUND:
      return 'Autoridad no encontrada'
    case REGULATORY_FRAMEWORK_ERROR_CODES.REGULATION_NOT_FOUND:
      return 'Norma no encontrada'
    case REGULATORY_FRAMEWORK_ERROR_CODES.CLAUSE_NOT_FOUND:
      return 'Numeral no encontrado'
    default:
      return 'Error'
  }
}

function respondValidationError(response: HttpContext['response'], detail: string) {
  return response.status(422).json({
    title: 'Parámetro inválido',
    detail,
    key: 'parametro-invalido',
    code: REGULATORY_FRAMEWORK_ERROR_CODES.VAL_INPUT,
  })
}

function respondUnhandledError(response: HttpContext['response'], _error?: unknown) {
  return response.status(500).json({
    title: 'Error interno',
    detail: 'Ocurrió un error inesperado al consultar el catálogo regulatorio.',
    key: 'error-interno',
    code: REGULATORY_FRAMEWORK_ERROR_CODES.SYS_UNHANDLED,
  })
}

/** Parsea `has_regulations=true|false`; `undefined` si ausente; `'invalid'` si no es un booleano reconocido. */
function parseHasRegulations(raw: unknown): boolean | undefined | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return undefined
  const str = String(raw).toLowerCase()
  if (str === 'true') return true
  if (str === 'false') return false
  return 'invalid'
}

// ─── Handlers (extraídos para facilitar pruebas unitarias sin IoC) ────────

export async function runListAuthorities(
  ctx: HttpContext,
  service: RegulatoryFrameworkService = new RegulatoryFrameworkService()
) {
  const { request, response, i18n } = ctx

  const rawCountry = request.qs().country
  const countryCode = rawCountry ? String(rawCountry).toUpperCase() : 'MX'
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    return respondValidationError(response, 'El parámetro country debe ser un código ISO-2 de dos letras.')
  }

  const hasRegulations = parseHasRegulations(request.qs().has_regulations)
  if (hasRegulations === 'invalid') {
    return respondValidationError(response, 'El parámetro has_regulations debe ser "true" o "false".')
  }

  try {
    const rows = await service.listAuthorities(countryCode, hasRegulations)
    return response.status(200).json({
      type: 'success',
      title: i18n.t('resources', undefined, 'Recursos'),
      message: i18n.t('resources_were_found_successfully', undefined, 'Recursos encontrados con éxito'),
      data: rows.map((row) => toAuthorityListDto(row, i18n)),
    })
  } catch (error: unknown) {
    if (error instanceof RegulatoryFrameworkError) return respondWithError(response, i18n, error)
    return respondUnhandledError(response, error)
  }
}

export async function runShowAuthority(
  ctx: HttpContext,
  service: RegulatoryFrameworkService = new RegulatoryFrameworkService()
) {
  const { params, response, i18n } = ctx

  try {
    const authority = await service.getAuthorityBySlug(String(params.slug))
    return response.status(200).json({
      type: 'success',
      title: i18n.t('resources', undefined, 'Recursos'),
      message: i18n.t('resources_were_found_successfully', undefined, 'Recursos encontrados con éxito'),
      data: toAuthorityDetailDto(authority, i18n),
    })
  } catch (error: unknown) {
    if (error instanceof RegulatoryFrameworkError) return respondWithError(response, i18n, error)
    return respondUnhandledError(response, error)
  }
}

export async function runShowRegulation(
  ctx: HttpContext,
  service: RegulatoryFrameworkService = new RegulatoryFrameworkService()
) {
  const { params, response, i18n } = ctx

  const code = String(params.code)
  if (!REGULATION_CODE_PATTERN.test(code)) {
    return respondWithError(
      response,
      i18n,
      RegulatoryFrameworkError.withMessageKey(
        'regulatory_framework_regulation_not_found',
        REGULATORY_FRAMEWORK_ERROR_CODES.REGULATION_NOT_FOUND,
        404,
        'norma-no-encontrada',
        'La norma solicitada no existe en el catálogo regulatorio.'
      )
    )
  }

  try {
    const regulation = await service.getRegulationByCode(code)
    return response.status(200).json({
      type: 'success',
      title: i18n.t('resources', undefined, 'Recursos'),
      message: i18n.t('resources_were_found_successfully', undefined, 'Recursos encontrados con éxito'),
      data: toRegulationDetailDto(regulation, i18n),
    })
  } catch (error: unknown) {
    if (error instanceof RegulatoryFrameworkError) return respondWithError(response, i18n, error)
    return respondUnhandledError(response, error)
  }
}

/** Valida `:code`/`:clauseCode` y devuelve el 404 correspondiente sin tocar BD si el formato es inválido. */
function validateClausePathParams(code: string, clauseCode: string): RegulatoryFrameworkError | null {
  if (!REGULATION_CODE_PATTERN.test(code)) {
    return RegulatoryFrameworkError.withMessageKey(
      'regulatory_framework_regulation_not_found',
      REGULATORY_FRAMEWORK_ERROR_CODES.REGULATION_NOT_FOUND,
      404,
      'norma-no-encontrada',
      'La norma solicitada no existe en el catálogo regulatorio.'
    )
  }
  if (!CLAUSE_CODE_PATTERN.test(clauseCode)) {
    return RegulatoryFrameworkError.withMessageKey(
      'regulatory_framework_clause_not_found',
      REGULATORY_FRAMEWORK_ERROR_CODES.CLAUSE_NOT_FOUND,
      404,
      'numeral-no-encontrado',
      'El numeral solicitado no existe en la norma indicada.'
    )
  }
  return null
}

export async function runShowClause(
  ctx: HttpContext,
  service: RegulatoryFrameworkService = new RegulatoryFrameworkService()
) {
  const { params, response, i18n } = ctx
  const code = String(params.code)
  const clauseCode = String(params.clauseCode)

  const formatError = validateClausePathParams(code, clauseCode)
  if (formatError) return respondWithError(response, i18n, formatError)

  try {
    const clause = await service.getClauseDetail(code, clauseCode)
    return response.status(200).json({
      type: 'success',
      title: i18n.t('resources', undefined, 'Recursos'),
      message: i18n.t('resources_were_found_successfully', undefined, 'Recursos encontrados con éxito'),
      data: toClauseDetailDto(clause, i18n),
    })
  } catch (error: unknown) {
    if (error instanceof RegulatoryFrameworkError) return respondWithError(response, i18n, error)
    return respondUnhandledError(response, error)
  }
}

export async function runShowClauseFeatures(
  ctx: HttpContext,
  service: RegulatoryFrameworkService = new RegulatoryFrameworkService()
) {
  const { params, response, i18n } = ctx
  const code = String(params.code)
  const clauseCode = String(params.clauseCode)

  const formatError = validateClausePathParams(code, clauseCode)
  if (formatError) return respondWithError(response, i18n, formatError)

  try {
    const clause = await service.getClauseDetail(code, clauseCode)
    return response.status(200).json({
      type: 'success',
      title: i18n.t('resources', undefined, 'Recursos'),
      message: i18n.t('resources_were_found_successfully', undefined, 'Recursos encontrados con éxito'),
      data: {
        clause: { id: clause.id, code: clause.code },
        features: clause.features.map((feature) => toFeatureDto(feature, i18n)),
      },
    })
  } catch (error: unknown) {
    if (error instanceof RegulatoryFrameworkError) return respondWithError(response, i18n, error)
    return respondUnhandledError(response, error)
  }
}
