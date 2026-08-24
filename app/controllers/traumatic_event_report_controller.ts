import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import RoleService from '#services/role_service'
import TraumaticEventReportService from '#services/traumatic_event_report_service'
import TraumaticEventRegistryReportService from '#services/traumatic_event_registry_report_service'
import type { RegistryReportFilters } from '#services/traumatic_event_registry_report_service'
import TraumaticEventReportDocumentService from '#services/traumatic_event_report_document_service'
import {
  traumaticEventReportListValidator,
  createTraumaticEventReportValidator,
  createEmployeeTraumaticEventReportValidator,
  updateTraumaticEventReportValidator,
  traumaticEventRegistryFiltersValidator,
} from '#validators/traumatic_event_report'
import { ETR_ERROR_CODES } from '../constants/traumatic_event_report_error_codes.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'
import { resolveTraumaticEventReportApiError } from '../helpers/traumatic_event_report_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import PiiExportService from '#services/pii_export_service'
import { SENSITIVE_EXPORT_INVENTORY } from '#constants/sensitive_export_inventory'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'

const MODULE_SLUG = 'traumatic-event-reports'

export default class TraumaticEventReportController {
  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports:
   *   get:
   *     summary: Lista paginada de reportes de evento traumático
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         required: true
   *         schema: { type: integer, minimum: 1, maximum: 500 }
   *       - in: query
   *         name: search
   *         required: false
   *         schema: { type: string }
   *       - in: query
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: traumaticEventTypeId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: dateFrom
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: dateTo
   *         required: false
   *         schema: { type: string, format: date }
   *     responses:
   *       '200': { description: Listado paginado de reportes ordenado por occurred_at DESC }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read en el módulo }
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(traumaticEventReportListValidator)
      const service = new TraumaticEventReportService()
      const bundle = await service.listPaginated(
        {
          page: filters.page,
          limit: filters.limit,
          search: filters.search,
          employeeId: filters.employeeId,
          traumaticEventTypeId: filters.traumaticEventTypeId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        'Traumatic Event Reports',
        'Reportes de evento traumático obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/traumatic-event-reports
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports:
   *   post:
   *     summary: Registrar reporte de evento traumático (NOM-035 §6.5)
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - traumaticEventReportEmployeeId
   *               - traumaticEventTypeId
   *               - traumaticEventReportOccurredAt
   *               - traumaticEventReportInvolvedPeople
   *               - traumaticEventReportDescription
   *             properties:
   *               traumaticEventReportEmployeeId: { type: integer }
   *               traumaticEventTypeId: { type: integer }
   *               traumaticEventReportOccurredAt:
   *                 type: string
   *                 format: date
   *                 description: Fecha de ocurrencia (no puede ser futura).
   *               traumaticEventReportInvolvedPeople:
   *                 type: string
   *                 description: Personas involucradas en el evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *               traumaticEventReportDescription:
   *                 type: string
   *                 description: Descripción del evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *     responses:
   *       '201': { description: Reporte creado con elaboratedAt, origin=rh y capturedByUserId asignados }
   *       '400':
   *         description: |
   *           Validación inválida. Posibles `key`:
   *           - `fecha-ocurrencia-futura` (fecha futura)
   *           - `tipo-evento-invalido` (tipo inexistente o inactivo)
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso create en el módulo }
   *       '404': { description: Empleado fuera del scope del usuario }
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createTraumaticEventReportValidator)
      const service = new TraumaticEventReportService()
      const created = await service.create(
        {
          traumaticEventReportEmployeeId: body.traumaticEventReportEmployeeId,
          traumaticEventTypeId: body.traumaticEventTypeId,
          traumaticEventReportOccurredAt: body.traumaticEventReportOccurredAt,
          traumaticEventReportInvolvedPeople: body.traumaticEventReportInvolvedPeople,
          traumaticEventReportDescription: body.traumaticEventReportDescription,
          capturedByUserId: ctx.auth.user!.userId,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Traumatic Event Report',
        'Reporte de evento traumático creado correctamente',
        201
      )
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/traumatic-event-reports  (canal app del empleado)
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/v1/traumatic-event-reports:
   *   post:
   *     summary: Registrar reporte de evento traumático desde la app del empleado (NOM-035 §6.5)
   *     description: |
   *       Canal de captura del propio trabajador afectado desde la app (Flutter).
   *       El servidor resuelve el empleado desde el token (nunca del body), fija
   *       `origin='employee'`, y asigna `elaboratedAt` y `capturedByUserId` en el
   *       servidor. Reutiliza la misma tabla, servicio y catálogo que el flujo de RH.
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - traumaticEventTypeId
   *               - traumaticEventReportOccurredAt
   *               - traumaticEventReportInvolvedPeople
   *               - traumaticEventReportDescription
   *             properties:
   *               traumaticEventTypeId: { type: integer }
   *               traumaticEventReportOccurredAt:
   *                 type: string
   *                 format: date
   *                 description: Fecha de ocurrencia (no puede ser futura).
   *               traumaticEventReportInvolvedPeople:
   *                 type: string
   *                 description: Personas involucradas en el evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *               traumaticEventReportDescription:
   *                 type: string
   *                 description: Descripción del evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *     responses:
   *       '201': { description: Reporte creado con origin=employee, elaboratedAt y capturedByUserId asignados por el servidor }
   *       '400':
   *         description: |
   *           Validación inválida. Posibles `key`:
   *           - `fecha-ocurrencia-futura` (fecha futura)
   *           - `tipo-evento-invalido` (tipo inexistente o inactivo)
   *           - `empleado-no-asociado` (el usuario autenticado no tiene empleado)
   *       '401': { description: Sin autenticación (guard auth) }
   */
  async storeFromEmployee(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      // El guard `auth()` de la ruta ya garantizó la autenticación (401 antes de entrar).
      const user = ctx.auth.user!

      // Regla 1: el empleado es el del token, nunca el del body. La cadena
      // person->employee puede no venir precargada con la auth por token opaco.
      await user.load('person', (personQuery) => personQuery.preload('employee'))
      const employee = user.person?.employee

      if (!employee) {
        // Regla 6: sin empleado asociado no se crea nada. Paridad con el login,
        // que responde 400 cuando el User no tiene empleado.
        throw new TraumaticEventReportError(
          'El usuario autenticado no tiene un empleado asociado.',
          ETR_ERROR_CODES.FORBIDDEN,
          400,
          'empleado-no-asociado'
        )
      }

      const body = await request.validateUsing(createEmployeeTraumaticEventReportValidator)
      const service = new TraumaticEventReportService()
      const created = await service.create(
        {
          traumaticEventReportEmployeeId: employee.employeeId,
          traumaticEventTypeId: body.traumaticEventTypeId,
          traumaticEventReportOccurredAt: body.traumaticEventReportOccurredAt,
          traumaticEventReportInvolvedPeople: body.traumaticEventReportInvolvedPeople,
          traumaticEventReportDescription: body.traumaticEventReportDescription,
          capturedByUserId: user.userId,
          traumaticEventReportOrigin: 'employee',
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Traumatic Event Report',
        'Reporte de evento traumático creado correctamente',
        201
      )
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:id
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{id}:
   *   get:
   *     summary: Obtener un reporte de evento traumático por ID
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Reporte con empleado y tipo embebidos }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read en el módulo }
   *       '404': { description: Reporte inexistente o fuera del scope }
   */
  async show(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const id = this.parseId(params.id)
      const service = new TraumaticEventReportService()
      const report = await service.findById(id, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        report,
        'Traumatic Event Report',
        'Reporte de evento traumático encontrado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // PUT /api/traumatic-event-reports/:id
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{id}:
   *   put:
   *     summary: Actualizar reporte de evento traumático
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               traumaticEventReportEmployeeId: { type: integer }
   *               traumaticEventTypeId: { type: integer }
   *               traumaticEventReportOccurredAt:
   *                 type: string
   *                 format: date
   *               traumaticEventReportInvolvedPeople:
   *                 type: string
   *                 description: Personas involucradas en el evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *               traumaticEventReportDescription:
   *                 type: string
   *                 description: Descripción del evento. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *     responses:
   *       '200': { description: Reporte actualizado }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso update en el módulo }
   *       '404': { description: Reporte inexistente o fuera del scope }
   */
  async update(ctx: HttpContext) {
    const { request, params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseId(params.id)
      const body = await request.validateUsing(updateTraumaticEventReportValidator)
      const service = new TraumaticEventReportService()
      const updated = await service.update(
        id,
        {
          traumaticEventReportEmployeeId: body.traumaticEventReportEmployeeId,
          traumaticEventTypeId: body.traumaticEventTypeId,
          traumaticEventReportOccurredAt: body.traumaticEventReportOccurredAt,
          traumaticEventReportInvolvedPeople: body.traumaticEventReportInvolvedPeople,
          traumaticEventReportDescription: body.traumaticEventReportDescription,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        updated,
        'Traumatic Event Report',
        'Reporte de evento traumático actualizado correctamente'
      )
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/traumatic-event-reports/:id
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{id}:
   *   delete:
   *     summary: Eliminar reporte de evento traumático (soft delete)
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Reporte eliminado (soft delete) }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso delete en el módulo }
   *       '404': { description: Reporte inexistente o fuera del scope }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseId(params.id)
      const service = new TraumaticEventReportService()
      const deleted = await service.destroy(id, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        deleted,
        'Traumatic Event Report',
        'Reporte de evento traumático eliminado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: 'No autorizado',
        detail: 'Usuario no autenticado.',
        key: 'unauthorized',
        errorCode: ETR_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'update' | 'delete'
  ) {
    const user = ctx.auth.user!
    await user.preload('role')
    const isRoot = user.role?.roleSlug === 'root'
    if (isRoot) return true

    const roleService = new RoleService()
    const allowed = await roleService.hasAccess(user.roleId, MODULE_SLUG, action)
    if (!allowed) {
      ctx.response.status(403).json({
        type: 'error',
        title: 'Sin permiso',
        detail: 'No tienes permiso para esta operación sobre reportes de evento traumático.',
        key: 'sin-permiso',
        errorCode: ETR_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/registry
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/registry:
   *   get:
   *     summary: Registro auditable paginado de eventos traumáticos (NOM-035 §5.8.c)
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: eventTypeId
   *         schema: { type: integer }
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 500 }
   *     responses:
   *       '200': { description: Registro paginado con canalizaciones y exámenes }
   *       '400': { description: Rango invertido ETR.VAL.RANGE.001 }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read ETR.FORBID.001 }
   */
  async registry(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const raw = await request.validateUsing(traumaticEventRegistryFiltersValidator)
      const filters = this.toRegistryFilters(raw)
      const service = new TraumaticEventRegistryReportService()
      const bundle = await service.getRegistryPaginated(filters, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        bundle,
        'Traumatic Event Registry',
        'Registro auditable obtenido correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/:reportId/printable-document
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/{reportId}/printable-document:
   *   get:
   *     summary: Genera el PDF del escrito oficial NOM-035 §6.5 de un reporte
   *     description: |
   *       Genera en memoria el documento imprimible del escrito de informe de
   *       acontecimiento traumático severo (NOM-035-STPS-2018, numeral 6.5), con:
   *       marca Valanserh, datos del trabajador, tipo de evento, fecha de ocurrencia,
   *       descripción, personas involucradas y espacio de firmas.
   *       Responde 400 con ETR.VAL.DOC.001 si el reporte no tiene todos los campos
   *       requeridos para generar el escrito.
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: reportId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: PDF binario (Content-Disposition attachment)
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *       '400': { description: Reporte incompleto ETR.VAL.DOC.001 (key reporte-incompleto) }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read ETR.FORBID.001 }
   *       '404': { description: Reporte fuera del scope ETR.NF.REPORT.001 }
   */
  async printableDocument(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const reportId = this.parseId(params.reportId)
      const service = new TraumaticEventReportDocumentService()
      const pdfBuffer = await service.buildDocument(reportId, ctx.businessUnitScope)

      response.header('Content-Type', 'application/pdf')
      response.header(
        'Content-Disposition',
        `attachment; filename="escrito-evento-${reportId}.pdf"`
      )
      return response.send(pdfBuffer)
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  // ---------------------------------------------------------------------------
  // GET /api/traumatic-event-reports/registry/export
  // ---------------------------------------------------------------------------
  /**
   * @swagger
   * /api/traumatic-event-reports/registry/export:
   *   get:
   *     summary: Exporta el registro auditable NOM-035 §5.8.c en PDF
   *     description: |
   *       Genera el PDF del registro en memoria (sin persistir en disco) con marca
   *       Valanserh, fundamento legal NOM-035 §5.8.c y las tarjetas de cada trabajador
   *       con sus canalizaciones y exámenes practicados. Devuelve siempre 200 (el PDF
   *       incluye estado vacío si no hay registros — nunca 404).
   *     tags: [TraumaticEventReports]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: eventTypeId
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: PDF binario (application/pdf)
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *       '400': { description: Rango invertido ETR.VAL.RANGE.001 }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso read ETR.FORBID.001 }
   */
  async registryExport(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const raw = await request.validateUsing(traumaticEventRegistryFiltersValidator)
      const filters = this.toRegistryFilters(raw)
      const service = new TraumaticEventRegistryReportService()
      const items = await service.getRegistryAll(filters, ctx.businessUnitScope)
      const piiExportService = new PiiExportService()
      const exportDef = SENSITIVE_EXPORT_INVENTORY.find(
        (item) => item.exportKey === 'traumatic-events-registry-pdf'
      )!

      const pdfBuffer = await piiExportService.deliverSensitiveExport(
        ctx,
        {
          exportKey: exportDef.exportKey,
          sensitiveColumns: [...exportDef.sensitiveColumns],
          employeeIds: items.map((item) => item.employee.employeeId),
          filters: {
            from: filters.from?.toISODate() ?? null,
            to: filters.to?.toISODate() ?? null,
            eventTypeId: filters.eventTypeId ?? null,
          },
          businessUnitId: piiExportService.resolveAuditBusinessUnitId(ctx.businessUnitScope ?? []),
          originModule: 'compliance',
        },
        async (maskSensitive) => service.renderRegistryPdf(items, filters, { maskSensitive })
      )

      const dateTag = DateTime.now().setZone('America/Mexico_City').toFormat('yyyyLLdd')
      response.header('Content-Type', 'application/pdf')
      response.header(
        'Content-Disposition',
        `attachment; filename="registro-eventos-traumaticos-${dateTag}.pdf"`
      )
      return response.send(pdfBuffer)
    } catch (error) {
      const auditError = PiiExportService.formatAuditError(error, i18n)
      if (auditError) {
        return response.status(auditError.status).json(auditError.body)
      }
      return this.respondError(error, response, 400)
    }
  }

  private toRegistryFilters(raw: {
    from?: Date
    to?: Date
    eventTypeId?: number
    page?: number
    limit?: number
  }): RegistryReportFilters {
    return {
      from: raw.from ? DateTime.fromJSDate(raw.from).startOf('day') : null,
      to: raw.to ? DateTime.fromJSDate(raw.to).startOf('day') : null,
      eventTypeId: raw.eventTypeId,
      page: raw.page,
      limit: raw.limit,
    }
  }

  private parseId(raw: unknown): number {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('El identificador del reporte es inválido.')
    }
    return id
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number
  ) {
    const resolved = resolveTraumaticEventReportApiError(error, fallbackStatus)
    return response.status(resolved.status).json({
      type: 'error',
      title: 'Error',
      detail: resolved.message,
      key: resolved.key,
      errorCode: resolved.errorCode,
      data: null,
    })
  }
}
