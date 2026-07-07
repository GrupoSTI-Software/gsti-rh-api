import type { HttpContext } from '@adonisjs/core/http'
import ExcelJS from 'exceljs'
import { assertConsentEvidenceAccess } from '#helpers/consent_evidence_rbac'
import { CONSENT_EVIDENCE_ERROR_CODES } from '#constants/consent_evidence_error_codes'
import type { LegalDocumentType } from '#models/legal_document'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import EvidenceService from './evidence.service.js'
import { getEvidenceExportValidator, getEvidenceValidator } from './validators/get_evidence.validator.js'
import type { EvidenceFilters } from './evidence.repository.js'

const RBAC_FORBIDDEN = {
  errorCode: CONSENT_EVIDENCE_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'consent_evidence',
}

/** Etiqueta legible del tipo de documento para la columna del `.xlsx` (sin i18n: mismo criterio que otros exports del repo). */
const DOCUMENT_TYPE_LABELS: Record<LegalDocumentType, string> = {
  privacy_notice: 'Aviso de privacidad',
  terms_conditions: 'Términos y condiciones',
  biometric_consent: 'Consentimiento biométrico',
}

/**
 * Controller de consulta/export de evidencia de aceptaciones (USRH1783368377327).
 *
 * Solo lectura, reservado al rol `root`: cada acción llama primero a
 * `assertConsentEvidenceAccess`, que responde 403 `CEVI.FORB.001` a cualquier rol
 * distinto de `root` (incluido `super-administrador`, rol de empresa cliente — ver
 * nota en `app/helpers/consent_evidence_rbac.ts`). Sin `middleware.businessScope()`:
 * la evidencia es global, filtrable por `businessUnitId` (nunca aislada por defecto).
 */
export default class EvidenceController {
  /**
   * @swagger
   * /api/consent/evidence:
   *   get:
   *     summary: Consulta paginada de evidencia de aceptaciones (solo rol root)
   *     description: |
   *       Lista la evidencia de aceptación de documentos legales (aviso de privacidad,
   *       términos y condiciones, consentimiento biométrico) registrada por el cimiento
   *       USRH1783101935670, filtrable por documento (tipo + versión, o `legalDocumentId`),
   *       por usuario y por empresa (tenant). `userConsentIp`/`userConsentUserAgent` salen
   *       enmascarados salvo que el caller tenga el permiso dedicado de revelado y pida
   *       `reveal=true`. Solo lectura: no altera ni recalcula la evidencia.
   *     security:
   *       - bearerAuth: []
   *     tags: [ConsentEvidence]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Idioma de los mensajes traducidos. Default `es`."
   *       - in: query
   *         name: type
   *         required: false
   *         schema: { type: string, enum: [privacy_notice, terms_conditions, biometric_consent] }
   *       - in: query
   *         name: version
   *         required: false
   *         schema: { type: string, example: "1.0" }
   *       - in: query
   *         name: legalDocumentId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: userId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: businessUnitPublicId
   *         required: false
   *         description: "Código público (UUID v4) de la empresa. Ausente = evidencia global (todas las empresas); presente = solo esa empresa. Forma canónica del filtro por tenant."
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         description: "Id interno de la empresa. Legacy — usar businessUnitPublicId."
   *         deprecated: true
   *         schema: { type: integer }
   *       - in: query
   *         name: page
   *         required: false
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: perPage
   *         required: false
   *         schema: { type: integer, minimum: 1, maximum: 500, default: 20 }
   *       - in: query
   *         name: reveal
   *         required: false
   *         description: "Se honra solo si el caller tiene el permiso dedicado de revelado; si no, se ignora."
   *         schema: { type: boolean, default: false }
   *     responses:
   *       200:
   *         description: Página de evidencia
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Evidencia de aceptaciones
   *               message: Evidencia de aceptaciones obtenida correctamente.
   *               data:
   *                 data:
   *                   - userId: 10
   *                     userName: Ana Torres
   *                     businessUnitPublicIds: ["550e8400-e29b-41d4-a716-446655440000"]
   *                     businessUnitNames: ["Empresa Demo"]
   *                     legalDocumentId: 3
   *                     documentType: biometric_consent
   *                     version: "1.0"
   *                     acceptedAt: "2026-07-02T10:00:00.000-06:00"
   *                     ip: "••••••••••.10.0.5"
   *                     userAgent: "••••••••••••••••••••••••••Safari"
   *                 meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 }
   *       401:
   *         description: Access token ausente, inválido o expirado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: No autorizado
   *               detail: El access token es inválido o ha expirado.
   *               message: No autorizado.
   *               key: token_invalid
   *               data: { refreshable: false }
   *       403:
   *         description: Rol distinto de root (ninguna empresa cliente accede)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: CEVI.FORB.001
   *               data: null
   *       422:
   *         description: Filtros inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Evidencia de aceptaciones
   *               message: Filtros de consulta inválidos
   *               detail: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *               key: filtros-invalidos
   *               errorCode: CEVI.VAL.001
   *               data:
   *                 errors:
   *                   - field: type
   *                     message: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *                     rule: enum
   */
  async index(ctx: HttpContext, service: EvidenceService = new EvidenceService()) {
    if (!(await assertConsentEvidenceAccess(ctx, 'read', RBAC_FORBIDDEN))) return

    const { request, response, i18n, auth } = ctx
    let payload
    try {
      payload = await getEvidenceValidator.validate(request.qs())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    const businessUnitFilter = await this.resolveBusinessUnitId(ctx, payload)
    if (businessUnitFilter === null) return

    const revealAllowed = await this.resolveRevealAllowed(payload.reveal, auth.user!.roleId, service)
    const data = await service.getEvidence(
      this.toFilters(payload, businessUnitFilter),
      { page: payload.page ?? 1, perPage: payload.perPage ?? 20 },
      revealAllowed
    )

    return response.status(200).json({
      type: 'success',
      title: i18n.t('consent_evidence_title', undefined, 'Evidencia de aceptaciones'),
      message: i18n.t(
        'consent_evidence_list_success',
        undefined,
        'Evidencia de aceptaciones obtenida correctamente.'
      ),
      data,
    })
  }

  /**
   * @swagger
   * /api/consent/evidence/export:
   *   get:
   *     summary: Exporta a Excel la evidencia de aceptaciones consultada (solo rol root)
   *     description: |
   *       Genera un `.xlsx` con la evidencia filtrada (mismos filtros que la lista, sin
   *       paginación). Sin `businessUnitPublicId` exporta TODAS las empresas; con
   *       `businessUnitPublicId` exporta solo esa empresa, para entregarle a un cliente
   *       corporativo su propia evidencia. Respeta el mismo gate de revelado que la lista:
   *       las columnas de IP/user-agent salen en claro solo si el caller tiene el permiso
   *       dedicado.
   *     security:
   *       - bearerAuth: []
   *     tags: [ConsentEvidence]
   *     parameters:
   *       - in: header
   *         name: Authorization
   *         required: true
   *         schema: { type: string }
   *         description: "Bearer access token."
   *       - in: header
   *         name: Accept-Language
   *         required: false
   *         schema: { type: string, enum: [es, en] }
   *         description: "Idioma de los mensajes traducidos. Default `es`."
   *       - in: query
   *         name: type
   *         required: false
   *         schema: { type: string, enum: [privacy_notice, terms_conditions, biometric_consent] }
   *       - in: query
   *         name: version
   *         required: false
   *         schema: { type: string, example: "1.0" }
   *       - in: query
   *         name: legalDocumentId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: userId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: businessUnitPublicId
   *         required: false
   *         description: "Código público (UUID v4) de la empresa. Ausente = TODO (todas las empresas); presente = solo esa empresa. Forma canónica del filtro por tenant."
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         description: "Id interno de la empresa. Legacy — usar businessUnitPublicId."
   *         deprecated: true
   *         schema: { type: integer }
   *       - in: query
   *         name: reveal
   *         required: false
   *         schema: { type: boolean, default: false }
   *     responses:
   *       200:
   *         description: Archivo `.xlsx` generado correctamente (Content-Disposition attachment)
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: {}
   *       401:
   *         description: Access token ausente, inválido o expirado
   *         content:
   *           application/json:
   *             example:
   *               type: warning
   *               title: No autorizado
   *               detail: El access token es inválido o ha expirado.
   *               message: No autorizado.
   *               key: token_invalid
   *               data: { refreshable: false }
   *       403:
   *         description: Rol distinto de root (ninguna empresa cliente accede)
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Sin permiso
   *               message: No tienes permiso para consultar este módulo.
   *               key: sin-permiso
   *               errorCode: CEVI.FORB.001
   *               data: null
   *       422:
   *         description: Filtros inválidos
   *         content:
   *           application/json:
   *             example:
   *               type: error
   *               title: Evidencia de aceptaciones
   *               message: Filtros de consulta inválidos
   *               detail: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *               key: filtros-invalidos
   *               errorCode: CEVI.VAL.001
   *               data:
   *                 errors:
   *                   - field: type
   *                     message: The type field must be one of privacy_notice, terms_conditions, biometric_consent
   *                     rule: enum
   */
  async export(ctx: HttpContext, service: EvidenceService = new EvidenceService()) {
    if (!(await assertConsentEvidenceAccess(ctx, 'read', RBAC_FORBIDDEN))) return

    const { request, response, auth } = ctx
    let payload
    try {
      payload = await getEvidenceExportValidator.validate(request.qs())
    } catch (error) {
      return this.validationError(ctx, error)
    }

    const businessUnitFilter = await this.resolveBusinessUnitId(ctx, payload)
    if (businessUnitFilter === null) return

    const revealAllowed = await this.resolveRevealAllowed(payload.reveal, auth.user!.roleId, service)
    const rows = await service.getExportRows(this.toFilters(payload, businessUnitFilter), revealAllowed)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Evidencia de aceptaciones')
    worksheet.columns = [
      { header: 'Usuario', key: 'userName', width: 32 },
      { header: 'Empresa', key: 'businessUnitNames', width: 30 },
      { header: 'Documento', key: 'documentTypeLabel', width: 26 },
      { header: 'Versión', key: 'version', width: 12 },
      { header: 'Fecha de aceptación', key: 'acceptedAt', width: 24 },
      { header: 'IP', key: 'ip', width: 22 },
      { header: 'Navegador / dispositivo', key: 'userAgent', width: 40 },
    ]

    for (const row of rows) {
      worksheet.addRow({
        userName: row.userName,
        businessUnitNames: row.businessUnitNames.join(', '),
        documentTypeLabel: DOCUMENT_TYPE_LABELS[row.documentType],
        version: row.version,
        acceptedAt: row.acceptedAt,
        ip: row.ip,
        userAgent: row.userAgent,
      })
    }

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `evidencia-aceptaciones_${Date.now()}.xlsx`

    response.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response.header('Content-Disposition', `attachment; filename="${filename}"`)
    return response.send(buffer)
  }

  /** `reveal=true` se honra solo si el rol tiene el permiso dedicado (regla 4, sin fuga). */
  private async resolveRevealAllowed(
    requestedReveal: boolean | undefined,
    roleId: number,
    service: EvidenceService
  ): Promise<boolean> {
    if (!requestedReveal) return false
    return service.canReveal(roleId)
  }

  /**
   * Resuelve el filtro de empresa a partir de `businessUnitPublicId` (UUID, forma canónica)
   * o `businessUnitId` (legacy). El id numérico interno nunca se expone a clientes
   * (`business_unit.ts`: `serializeAs: null`); por eso el endpoint recibe el código público
   * y lo traduce aquí con `BusinessAccessScopeService` — el mismo mecanismo que ya usa
   * `business_unit_scope_middleware` para el header `X-Business-Unit-Id`.
   *
   * Devuelve `undefined` si no hay filtro de empresa. Devuelve `null` si `businessUnitPublicId`
   * no resuelve (UUID válido pero inexistente/inactivo) — en ese caso ya respondió 422 y el
   * caller debe retornar sin continuar.
   */
  private async resolveBusinessUnitId(
    ctx: HttpContext,
    payload: { businessUnitPublicId?: string; businessUnitId?: number }
  ): Promise<number | undefined | null> {
    if (!payload.businessUnitPublicId) {
      return payload.businessUnitId
    }

    const scopeService = new BusinessAccessScopeService()
    const scopeIds = await scopeService.getAccessibleIds(ctx.auth.user!)
    const resolvedId = await scopeService.resolveInternalId(payload.businessUnitPublicId, scopeIds)

    if (resolvedId === null) {
      this.businessUnitError(ctx)
      return null
    }

    return resolvedId
  }

  private toFilters(
    payload: {
      type?: LegalDocumentType
      version?: string
      legalDocumentId?: number
      userId?: number
    },
    businessUnitId: number | undefined
  ): EvidenceFilters {
    return {
      type: payload.type,
      version: payload.version,
      legalDocumentId: payload.legalDocumentId,
      userId: payload.userId,
      businessUnitId,
    }
  }

  private businessUnitError(ctx: HttpContext) {
    const { i18n } = ctx
    ctx.response.status(422).json({
      type: 'error',
      title: i18n.t('consent_evidence_title', undefined, 'Evidencia de aceptaciones'),
      message: i18n.t(
        'consent_evidence_invalid_filters_title',
        undefined,
        'Filtros de consulta inválidos'
      ),
      detail: i18n.t(
        'consent_evidence_invalid_business_unit_detail',
        undefined,
        'El businessUnitPublicId indicado no existe o no es válido.'
      ),
      key: 'filtros-invalidos',
      errorCode: CONSENT_EVIDENCE_ERROR_CODES.VALIDATION,
      data: null,
    })
  }

  private validationError(ctx: HttpContext, error: unknown) {
    const { i18n } = ctx
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ field: string; message: string; rule: string }> }).messages
        : undefined

    return ctx.response.status(422).json({
      type: 'error',
      title: i18n.t('consent_evidence_title', undefined, 'Evidencia de aceptaciones'),
      message: i18n.t(
        'consent_evidence_invalid_filters_title',
        undefined,
        'Filtros de consulta inválidos'
      ),
      detail:
        vineMessages?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : i18n.t(
              'consent_evidence_invalid_filters_detail',
              undefined,
              'Los filtros enviados no son válidos.'
            )),
      key: 'filtros-invalidos',
      errorCode: CONSENT_EVIDENCE_ERROR_CODES.VALIDATION,
      data: vineMessages ? { errors: vineMessages } : null,
    })
  }
}
