import { HttpContext } from '@adonisjs/core/http'
import { WJE_ERROR_CODES } from '#constants/work_journal_entry_error_codes'
import { resolveWorkJournalApiError } from '../../helpers/work_journal_api_error.js'
import WorkJournalService from './work_journal.service.js'
import { sealPeriodValidator } from './validators/seal_period.validator.js'
import { verifyPeriodValidator } from './validators/verify_period.validator.js'
import { listEntriesValidator } from './validators/list_entries.validator.js'

/**
 * Controller del registro electrónico de jornada.
 *
 * Seguridad: la empresa activa proviene del header X-Business-Unit-Id resuelto
 * por middleware.businessScope(); nunca se acepta por body/query. El sellado y
 * la verificación jamás cruzan empresas. Requiere middleware.auth() en la ruta.
 */
export default class WorkJournalController {
  /**
   * @swagger
   * /api/v1/work-journal-entries/seal:
   *   post:
   *     summary: Sella (congela) la jornada de un periodo de nómina
   *     description: Materializa la jornada desde el cálculo de asistencia vigente, la congela y calcula su sello HMAC-SHA-256. Los días ya cerrados se respetan (inmutables).
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkJournalEntries]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [from, to]
   *             properties:
   *               from: { type: string, example: "2027-01-01" }
   *               to: { type: string, example: "2027-01-15" }
   *               employeeIds:
   *                 type: array
   *                 items: { type: integer }
   *     responses:
   *       200: { description: "Periodo sellado: { sealed, skipped, failed }" }
   *       403: { description: Sin empresa en scope }
   *       422: { description: Rango inválido }
   *       500: { description: Falta el secreto HMAC }
   */
  async seal(ctx: HttpContext) {
    const { request, response, i18n } = ctx

    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    let payload
    try {
      payload = await sealPeriodValidator.validate(request.all())
    } catch (error) {
      return this.domainError(ctx, error)
    }

    try {
      const service = new WorkJournalService(i18n)
      const data = await service.seal(businessUnitId, payload)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('work_journal_seal_title', undefined, 'Registro electrónico de jornada'),
        message: i18n.t(
          'work_journal_seal_success_message',
          undefined,
          'Periodo sellado correctamente.'
        ),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/v1/work-journal-entries/verify:
   *   get:
   *     summary: Verifica la integridad de los registros cerrados de un periodo
   *     description: Recalcula el sello HMAC-SHA-256 y compara en tiempo constante; detecta alteraciones directas en base de datos.
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkJournalEntries]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema: { type: integer }
   *       - name: from
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2027-01-01" }
   *       - name: to
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2027-01-15" }
   *       - name: employeeId
   *         in: query
   *         required: false
   *         schema: { type: integer }
   *     responses:
   *       200: { description: "Resultado: { checked, valid, invalid }" }
   *       403: { description: Sin empresa en scope }
   *       422: { description: Rango inválido }
   */
  async verify(ctx: HttpContext) {
    const { request, response, i18n } = ctx

    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    let payload
    try {
      payload = await verifyPeriodValidator.validate(request.qs())
    } catch (error) {
      return this.domainError(ctx, error)
    }

    try {
      const service = new WorkJournalService(i18n)
      const data = await service.verify(businessUnitId, payload)
      return response.status(200).json({
        type: 'success',
        title: i18n.t('work_journal_verify_title', undefined, 'Verificación de jornada'),
        message: i18n.t(
          'work_journal_verify_success_message',
          undefined,
          'Verificación completada.'
        ),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/v1/work-journal-entries:
   *   get:
   *     summary: Lista paginada de registros de jornada de un periodo
   *     security:
   *       - bearerAuth: []
   *     tags: [WorkJournalEntries]
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         schema: { type: integer }
   *       - name: from
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2027-01-01" }
   *       - name: to
   *         in: query
   *         required: true
   *         schema: { type: string, example: "2027-01-15" }
   *       - name: employeeId
   *         in: query
   *         schema: { type: integer }
   *       - name: status
   *         in: query
   *         schema: { type: string, enum: [open, closed] }
   *       - name: page
   *         in: query
   *         schema: { type: integer, default: 1 }
   *       - name: limit
   *         in: query
   *         schema: { type: integer, default: 50 }
   *     responses:
   *       200: { description: OK (paginado) }
   *       403: { description: Sin empresa en scope }
   *       422: { description: Rango inválido }
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx

    const businessUnitId = ctx.businessUnitScope?.[0]
    if (!businessUnitId) {
      return this.forbidden(ctx)
    }

    let payload
    try {
      payload = await listEntriesValidator.validate(request.qs())
    } catch (error) {
      return this.domainError(ctx, error)
    }

    try {
      const service = new WorkJournalService(i18n)
      const data = await service.list(businessUnitId, payload.from, payload.to, {
        employeeId: payload.employeeId,
        status: payload.status,
        page: payload.page ?? 1,
        limit: payload.limit ?? 50,
      })
      return response.status(200).json({
        type: 'success',
        title: i18n.t('work_journal_list_title', undefined, 'Registro electrónico de jornada'),
        message: i18n.t(
          'work_journal_list_success_message',
          undefined,
          'Registros encontrados correctamente.'
        ),
        data,
      })
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /** Empresa fuera del scope del usuario autenticado (anti-IDOR, nunca del body). */
  private forbidden(ctx: HttpContext) {
    const detail = ctx.i18n.t(
      'work_journal_forbidden_message',
      undefined,
      'No hay una empresa activa en el scope del usuario.'
    )
    return ctx.response.status(403).json({
      type: 'error',
      title: ctx.i18n.t('work_journal_forbidden_title', undefined, 'Sin permiso'),
      message: detail,
      detail,
      key: 'sin-permiso',
      code: WJE_ERROR_CODES.FORBIDDEN,
    })
  }

  /** Traduce cualquier error de dominio/validación a la respuesta HTTP estándar. */
  private domainError(ctx: HttpContext, error: unknown) {
    const resolved = resolveWorkJournalApiError(error, 500, ctx.i18n)
    return ctx.response.status(resolved.status).json({
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      detail: resolved.detail ?? resolved.message,
      key: resolved.key,
      code: resolved.code,
    })
  }
}
