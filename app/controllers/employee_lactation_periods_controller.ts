import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import RoleService from '#services/role_service'
import EmployeeLactationPeriodService, {
  type EmployeeLactationPeriodCreatePayload,
  type EmployeeLactationPeriodUpdatePayload,
} from '#services/employee_lactation_period_service'
import EmployeeLactationComplianceReportService, {
  type ComplianceReportFilters,
} from '#services/employee_lactation_compliance_report_service'
import EmployeeLactationNotificationService from '#services/employee_lactation_notification_service'
import EmployeeLactationPeriodConflictService from '#services/employee_lactation_period_conflict_service'
import {
  createEmployeeLactationPeriodValidator,
  employeeLactationComplianceReportValidator,
  employeeLactationPeriodConflictsListValidator,
  employeeLactationPeriodConflictsReassignBulkValidator,
  employeeLactationPeriodListValidator,
  updateEmployeeLactationPeriodValidator,
} from '#validators/employee_lactation_period'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { LACTATION_COMPLIANCE_STATUS_VALUES } from '../constants/employee_lactation_compliance_status.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'
import { resolveEmployeeLactationPeriodApiError } from '../helpers/employee_lactation_period_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'
import PiiExportService from '#services/pii_export_service'
import { SENSITIVE_EXPORT_INVENTORY } from '#constants/sensitive_export_inventory'

/**
 * Esta funcionalidad NO tiene módulo propio en `system_modules`: vive
 * embebida en el apartado de "Información del empleado". Por eso los
 * checks de RBAC se hacen contra el módulo `employees`:
 *  - listar / consultar  → permiso `read`.
 *  - crear / editar / eliminar → permiso `update-information`
 *    (mismo permiso que usa medical conditions y otras secciones del perfil).
 */
const PARENT_MODULE_SLUG = 'employees'
const ACTION_PERMISSION_MAP: Record<'read' | 'create' | 'update' | 'delete', string> = {
  read: 'read',
  create: 'update-information',
  update: 'update-information',
  delete: 'update-information',
}

/**
 * Controlador REST del catálogo de periodos de lactancia (NOM-037-STPS-2023 / LFT 170).
 *
 * Expone CRUD completo bajo /api/employee-lactation-periods.
 * Aísla por empresa (vía `EmployeeLactationPeriodService`) y aplica
 * permisos del módulo `employees` a través de `RoleService` (root bypass).
 */
export default class EmployeeLactationPeriodsController {
  /**
   * @swagger
   * /api/employee-lactation-periods:
   *   get:
   *     summary: Lista paginada de periodos de lactancia (filtrada por empresa)
   *     tags: [EmployeeLactationPeriods]
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
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado paginado ordenado por start_date DESC }
   *       '400': { description: Validación inválida (page/limit/employeeId) }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo }
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(employeeLactationPeriodListValidator)
      const service = new EmployeeLactationPeriodService(ctx.i18n)
      const bundle = await service.listPaginated(
        filters.page,
        filters.limit,
        filters.employeeId,
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        'Employee Lactation Periods',
        'Periodos de lactancia obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods:
   *   post:
   *     summary: Crear periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - employeeId
   *               - employeeLactationPeriodStartDate
   *               - employeeLactationPeriodEndDate
   *               - employeeLactationPeriodType
   *             properties:
   *               employeeId: { type: integer }
   *               employeeLactationPeriodStartDate: { type: string, format: date }
   *               employeeLactationPeriodEndDate: { type: string, format: date }
   *               employeeLactationPeriodType:
   *                 type: string
   *                 enum: [two_rest_periods, reduced_hour]
   *               employeeLactationPeriodReductionApplication:
   *                 type: string
   *                 enum: [start, end, split]
   *               employeeLactationPeriodNotes:
   *                 type: string
   *                 nullable: true
   *                 maxLength: 500
   *                 description: Notas del periodo. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *               employeeChildrenId:
   *                 type: integer
   *                 nullable: true
   *                 description: |
   *                   Vínculo OPCIONAL al hijo registrado de la empleada que
   *                   justifica el derecho. Si se envía, debe pertenecer al
   *                   mismo `employeeId` o el endpoint responde 422 con
   *                   `key='hijo-no-pertenece-al-empleado'`.
   *     responses:
   *       '201': { description: Creado }
   *       '400': { description: Validación VineJS o end <= start }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'create' }
   *       '404': { description: Empleada inexistente o ajena a la empresa }
   *       '409':
   *         description: Traslape contra otro periodo activo (key `lactation-period-overlap`)
   *       '422':
   *         description: |
   *           Rango inválido o vínculo de hijo inconsistente.
   *           Posibles `key`:
   *           - `lactation-period-below-legal-minimum` (rango < 6 meses, LFT 170 IV)
   *           - `lactation-period-unreasonable-range` (rango > 24 meses, sanity check)
   *           - `hijo-no-pertenece-al-empleado` (el `employeeChildrenId` pertenece a otra empleada o no existe)
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const body = await request.validateUsing(createEmployeeLactationPeriodValidator)
      const payload = this.toCreatePayload(body)
      const service = new EmployeeLactationPeriodService(ctx.i18n)
      const created = await service.create(payload, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        created,
        'Employee Lactation Period',
        'Periodo de lactancia creado correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}:
   *   put:
   *     summary: Actualizar periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
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
   *               employeeId: { type: integer }
   *               employeeLactationPeriodStartDate: { type: string, format: date }
   *               employeeLactationPeriodEndDate: { type: string, format: date }
   *               employeeLactationPeriodType:
   *                 type: string
   *                 enum: [two_rest_periods, reduced_hour]
   *               employeeLactationPeriodReductionApplication:
   *                 type: string
   *                 enum: [start, end, split]
   *               employeeLactationPeriodNotes:
   *                 type: string
   *                 nullable: true
   *                 maxLength: 500
   *                 description: Notas del periodo. Puede llegar enmascarado según el permiso de lectura de su categoría.
   *               employeeChildrenId:
   *                 type: integer
   *                 nullable: true
   *                 description: |
   *                   Vínculo OPCIONAL al hijo. Comportamiento del patch parcial:
   *                   - Campo ausente: no se modifica el valor actual.
   *                   - `null`: desvincula explícitamente el hijo del periodo.
   *                   - Entero: vincula al hijo; debe pertenecer al mismo `employeeId`
   *                     o el endpoint responde 422 con `key='hijo-no-pertenece-al-empleado'`.
   *     responses:
   *       '200': { description: Actualizado }
   *       '400': { description: Validación VineJS o coherencia de fechas }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update' }
   *       '404': { description: Recurso ajeno o inexistente }
   *       '409':
   *         description: Traslape contra otro periodo activo (key `lactation-period-overlap`)
   *       '422':
   *         description: |
   *           Rango inválido o vínculo de hijo inconsistente.
   *           Posibles `key`:
   *           - `lactation-period-below-legal-minimum` (rango < 6 meses, LFT 170 IV)
   *           - `lactation-period-unreasonable-range` (rango > 24 meses, sanity check)
   *           - `hijo-no-pertenece-al-empleado` (el `employeeChildrenId` pertenece a otra empleada o no existe)
   */
  async update(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(updateEmployeeLactationPeriodValidator)
      const payload = this.toUpdatePayload(body)

      const service = new EmployeeLactationPeriodService(ctx.i18n)
      const updated = await service.update(id, payload, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        updated,
        'Employee Lactation Period',
        'Periodo de lactancia actualizado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}:
   *   delete:
   *     summary: Soft delete del periodo de lactancia
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Borrado lógico aplicado }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'delete' }
   *       '404': { description: Recurso ajeno o inexistente }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const id = this.parseResourceId(params.id)
      const service = new EmployeeLactationPeriodService(ctx.i18n)
      const deleted = await service.destroy(id, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        deleted,
        'Employee Lactation Period',
        'Periodo de lactancia eliminado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}/regenerate-shift-exceptions:
   *   post:
   *     summary: Regenera las excepciones de turno asociadas al periodo
   *     description: |
   *       Borra (soft-delete) TODAS las excepciones vinculadas al periodo de
   *       lactancia (pasadas y futuras) y vuelve a generarlas leyendo el
   *       `EmployeeShift` vigente para cada día del rango completo. Útil
   *       después de asignar un turno retroactivo, para reparar periodos
   *       desincronizados, o tras corregir errores en la captura.
   *
   *       - Diferente al hook automático de `update`, que sólo regenera
   *         excepciones futuras (fecha >= hoy) para preservar histórico.
   *       - Los días sin shift activo se reportan en `omittedDaysWithoutShift` (warning).
   *       - Los días que ya tenían otra excepción con PRECEDENCIA sobre
   *         la lactancia (incapacidad, vacaciones, permiso de falta,
   *         descanso como permiso, maternidad) o que son festivo oficial
   *         de descanso, se reportan en `skippedDaysWithConflict` y NO
   *         reciben reducción de lactancia (evita dos excepciones
   *         contradictorias el mismo día — crítico para auditoría STPS).
   *       - Si la empleada no tiene NINGÚN shift activo en todo el rango, responde 422.
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Regeneración exitosa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 lactationPeriodId: { type: integer }
   *                 regeneratedExceptionsCount: { type: integer }
   *                 omittedDaysWithoutShift:
   *                   type: array
   *                   items: { type: string, format: date }
   *                   description: Fechas sin EmployeeShift activo, no se generó excepción.
   *                 skippedDaysWithConflict:
   *                   type: array
   *                   items: { type: string, format: date }
   *                   description: |
   *                     Fechas omitidas porque ya tenían otra excepción con
   *                     precedencia (incapacidad, vacaciones, permiso, falta,
   *                     maternidad) o son festivo oficial de descanso. La
   *                     reducción de lactancia NO se aplica esos días para
   *                     evitar dos excepciones contradictorias.
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update' }
   *       '404': { description: Periodo inexistente o ajeno a la empresa }
   *       '422':
   *         description: La empleada no tiene shift activo en el rango (key `lactation-period-no-active-shift`)
   *       '500':
   *         description: |
   *           El tipo de excepción 'lactancia' no está configurado en la BD
   *           (key `lactation-exception-type-missing`). Ejecutar el seeder correspondiente.
   */
  async regenerateShiftExceptions(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const service = new EmployeeLactationPeriodService(ctx.i18n)
      const result = await service.regenerateShiftExceptions(id, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period',
        'Excepciones de turno regeneradas correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/compliance-report:
   *   get:
   *     summary: Reporte de cumplimiento de periodos de lactancia (JSON paginado)
   *     description: |
   *       Agrega los periodos de lactancia de la empresa con su estado calculado
   *       (`activa` / `por_vencer` / `vencida`), el número de días con reducción
   *       efectivamente aplicada (excepciones de turno vivas ligadas al periodo)
   *       y el conteo de evidencias documentales adjuntas.
   *
   *       El estado se calcula en runtime contra `today` en la zona horaria del
   *       sistema; el umbral de `por_vencer` es 30 días.
   *
   *       Aplica multitenancy: sólo devuelve periodos de empleadas cuya
   *       business_unit es accesible para el usuario autenticado.
   *     tags: [EmployeeLactationPeriods]
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
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [activa, por_vencer, vencida]
   *       - in: query
   *         name: from
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         description: Acota a una sola unidad de negocio (selector del header global)
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado paginado del reporte de cumplimiento }
   *       '400': { description: Validación inválida (rango from>to, filtros mal formados) }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo employees }
   */
  async complianceReport(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(employeeLactationComplianceReportValidator)
      const service = new EmployeeLactationComplianceReportService()
      const bundle = await service.getCompliancePaginated(
        this.toReportFilters(filters),
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        bundle,
        'Employee Lactation Compliance Report',
        'Reporte de cumplimiento de lactancia obtenido correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/compliance-report/export:
   *   get:
   *     summary: Exporta el paquete de evidencia STPS en PDF
   *     description: |
   *       Genera un PDF en memoria/streaming con los periodos que cumplen los
   *       filtros, incluyendo por cada empleada: fechas, tipo, modalidad,
   *       estado calculado, prueba de aplicación (días con reducción aplicada)
   *       y el conteo de evidencias documentales adjuntas. Cada página incluye
   *       en el pie la cita literal de los fundamentos legales: LFT artículo
   *       170 fracciones II y IV y NOM-037-STPS-2023 numeral 5.2.h.
   *
   *       El PDF nunca se persiste en disco del servidor. Se devuelve siempre
   *       200 (incluso cuando no hay registros) con un documento de "estado
   *       vacío" — nunca 404.
   *     tags: [EmployeeLactationPeriods]
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
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [activa, por_vencer, vencida]
   *       - in: query
   *         name: from
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: businessUnitId
   *         required: false
   *         description: Acota a una sola unidad de negocio (selector del header global)
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: PDF binario (application/pdf)
   *         content:
   *           application/pdf:
   *             schema: { type: string, format: binary }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo employees }
   */
  async complianceReportExport(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(employeeLactationComplianceReportValidator)
      const reportFilters = this.toReportFilters(filters)
      const service = new EmployeeLactationComplianceReportService()
      const items = await service.getComplianceAll(reportFilters, ctx.businessUnitScope)
      const piiExportService = new PiiExportService()
      const exportDef = SENSITIVE_EXPORT_INVENTORY.find(
        (item) => item.exportKey === 'lactation-compliance-pdf'
      )!

      const pdfBuffer = await piiExportService.deliverSensitiveExport(
        ctx,
        {
          exportKey: exportDef.exportKey,
          sensitiveColumns: [...exportDef.sensitiveColumns],
          employeeIds: [...new Set(items.map((item) => item.employee.employeeId))],
          filters: {
            page: reportFilters.page ?? null,
            limit: reportFilters.limit ?? null,
            status: reportFilters.status ?? null,
            from: reportFilters.from?.toISODate() ?? null,
            to: reportFilters.to?.toISODate() ?? null,
            employeeId: reportFilters.employeeId ?? null,
            businessUnitId: reportFilters.businessUnitId ?? null,
          },
          businessUnitId: piiExportService.resolveAuditBusinessUnitId(
            ctx.businessUnitScope ?? [],
            reportFilters.businessUnitId
          ),
          originModule: 'compliance',
        },
        async (maskSensitive) => service.renderCompliancePdf(items, reportFilters, { maskSensitive })
      )

      const filename = `reporte-cumplimiento-lactancia-${DateTime.now().toFormat('yyyyLLdd')}.pdf`
      response.header('Content-Type', 'application/pdf')
      response.header('Content-Disposition', `attachment; filename="${filename}"`)
      response.header('Content-Length', pdfBuffer.length.toString())
      response.status(200)
      return response.send(pdfBuffer)
    } catch (error) {
      const auditError = PiiExportService.formatAuditError(error, i18n)
      if (auditError) {
        return response.status(auditError.status).json(auditError.body)
      }
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/notifications/run-expiring-check:
   *   post:
   *     summary: Ejecuta manualmente la verificación de avisos de vencimiento
   *     description: |
   *       Endpoint de **prueba/reproceso** que dispara la misma rutina que el
   *       comando agendado `lactation:notify-expiring`. Detecta periodos de
   *       lactancia ACTIVOS cuyo `end` cae dentro de los próximos 30 días y
   *       NO tienen aviso `expiring` previo en bitácora, agrupa por empresa
   *       y envía un único correo a los destinatarios configurados en
   *       `system_setting_notification_emails`.
   *
   *       Es **idempotente**: invocarlo dos veces el mismo día NO duplica
   *       envíos. Una empresa sin destinatarios queda registrada en
   *       `companiesWithoutRecipients` (warning estructurado) pero NO
   *       interrumpe el procesamiento de las demás.
   *
   *       Acceso: igual que el resto del módulo, se rige por el módulo
   *       `employees`. Requiere permiso `update-information` (mismo permiso
   *       usado para gestionar periodos de lactancia desde el perfil del
   *       empleado). `root` siempre pasa.
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Verificación ejecutada correctamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type: { type: string, example: success }
   *                 title: { type: string }
   *                 message: { type: string }
   *                 data:
   *                   type: object
   *                   properties:
   *                     sentCount:
   *                       type: integer
   *                       description: Periodos para los que SÍ se registró un envío.
   *                     skippedAlreadyNotified:
   *                       type: integer
   *                       description: Periodos elegibles omitidos por idempotencia.
   *                     companiesWithoutRecipients:
   *                       type: array
   *                       items: { type: integer }
   *                       description: IDs de SystemSetting con periodos por vencer pero sin destinatarios.
   *                     companiesWithMailErrors:
   *                       type: array
   *                       items: { type: integer }
   *                       description: IDs de SystemSetting donde el envío del correo falló.
   *                     companiesNotified:
   *                       type: integer
   *                       description: Empresas que recibieron al menos un correo.
   *                     candidatesScanned:
   *                       type: integer
   *                       description: Periodos elegibles antes del filtro de idempotencia.
   *                     ranAt:
   *                       type: string
   *                       format: date-time
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' en el módulo employees }
   */
  async runExpiringCheck(ctx: HttpContext) {
    const { response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      // Se considera operación de gestión de RH; reusa el mismo permiso
      // que para crear/editar/borrar periodos, igual que el resto del
      // controlador (no se inventa un permiso nuevo para una pieza
      // accesoria del flujo).
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const service = new EmployeeLactationNotificationService()
      const result = await service.runExpiringCheck({
        info: (m, meta) =>
          // eslint-disable-next-line no-console
          console.info(`[lactation:notify-expiring] ${m}`, meta ?? ''),
        warn: (m, meta) =>
          // eslint-disable-next-line no-console
          console.warn(`[lactation:notify-expiring] ${m}`, meta ?? ''),
        error: (m, meta) =>
          // eslint-disable-next-line no-console
          console.error(`[lactation:notify-expiring] ${m}`, meta ?? ''),
      })

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Expiring Notifications',
        'Verificación de avisos de vencimiento ejecutada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}/conflicts:
   *   get:
   *     summary: Lista los días en conflicto del periodo (lactancia vs causa bloqueante)
   *     description: |
   *       Devuelve los días dentro del rango del periodo donde coexisten
   *       una excepción de lactancia (no borrada) Y otra causa bloqueante
   *       (vacación, incapacidad, maternidad, permiso, falta) o un festivo
   *       oficial de la BU del empleado. La detección reusa exactamente las
   *       mismas reglas que la generación inicial de lactancia.
   *
   *       Esta lista alimenta el sub-drawer de gestión de conflictos del
   *       Backoffice, donde el admin puede REVOCAR (perder el día) o
   *       REASIGNAR (mover la reducción al siguiente día disponible).
   *
   *       Sin paginación: el conjunto por periodo está acotado por el
   *       rango (máx. 24 meses) y en la práctica son pocos días.
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Lista de conflictos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 lactationPeriodId: { type: integer }
   *                 employeeId: { type: integer }
   *                 conflictsCount: { type: integer }
   *                 conflicts:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       conflictDate: { type: string, format: date }
   *                       lactationShiftExceptionId: { type: integer }
   *                       conflictType:
   *                         type: string
   *                         enum: [vacation, work_disability, maternity, rest_or_permission, holiday]
   *                       conflictSlug: { type: string }
   *                       conflictShiftExceptionId:
   *                         type: integer
   *                         nullable: true
   *                         description: ID de la fila bloqueante (null cuando el conflicto es un festivo del calendario).
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo employees }
   *       '404': { description: Periodo inexistente o ajeno a la empresa }
   */
  async listConflicts(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const id = this.parseResourceId(params.id)
      const service = new EmployeeLactationPeriodConflictService(ctx.i18n)
      const result = await service.list(id, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Conflicts',
        'Conflictos del periodo de lactancia obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}/conflicts/{shiftExceptionId}:
   *   delete:
   *     summary: Revoca (soft-delete) la excepción de lactancia de un día en conflicto
   *     description: |
   *       Marca como borrada (soft-delete) la fila de lactancia y persiste
   *       el motivo en `shift_exceptions_lactation_revoke_reason`. El
   *       motivo se clasifica automáticamente según el tipo de conflicto
   *       actual (`vacation_conflict`, `work_disability_conflict`,
   *       `maternity_conflict`, `rest_or_permission_conflict`,
   *       `holiday_conflict`).
   *
   *       NO modifica el `end_date` del periodo: la empleada pierde ese
   *       día de reducción sin extender el periodo (decisión consciente
   *       del admin). Si la intención fuera compensar, debe usar
   *       reasignar.
   *
   *       Idempotente: invocarlo dos veces sobre el mismo
   *       `shiftExceptionId` da 404 la segunda vez (la fila ya no es un
   *       conflicto activo).
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: shiftExceptionId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Revocación exitosa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 lactationPeriodId: { type: integer }
   *                 revokedDate: { type: string, format: date }
   *                 lactationShiftExceptionId: { type: integer }
   *                 reason: { type: string }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' en el módulo employees }
   *       '404': { description: Periodo o conflicto inexistente / ajeno a la empresa (key `lactation-conflict-not-found`) }
   */
  async revokeConflict(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const shiftExceptionId = this.parseResourceId(params.shiftExceptionId)
      const service = new EmployeeLactationPeriodConflictService(ctx.i18n)
      const result = await service.revoke(id, shiftExceptionId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Conflicts',
        'Día de lactancia revocado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}/conflicts/{shiftExceptionId}/reassign:
   *   post:
   *     summary: Reasigna el día de lactancia al siguiente día disponible posterior al fin del periodo
   *     description: |
   *       Compensa la reducción perdida moviendo el día de lactancia al
   *       PRIMER día disponible inmediatamente posterior al `end_date`
   *       actual del periodo. "Disponible" significa que NO es: descanso
   *       del turno, festivo oficial de la BU, día con excepción
   *       bloqueante existente, ni día ya cubierto por lactancia del
   *       mismo periodo.
   *
   *       Pasos atómicos (una sola transacción):
   *         1. Soft-delete de la fila original con razón `reassigned`.
   *         2. Alta de la nueva fila de lactancia en la fecha calculada
   *            (auditoría: `shift_exceptions_lactation_replaced_date`
   *            apunta al día revocado).
   *         3. Extensión del `employee_lactation_period_end_date` a la
   *            nueva fecha.
   *
   *       Cap superior: si la extensión cruza el máximo de 24 meses
   *       respecto al `start_date` original, responde 422 con
   *       `lactation-reassign-exceeds-max-range`. Si la búsqueda no
   *       encuentra ningún día disponible en el horizonte (90 días tras
   *       el `end_date`), responde 422 con
   *       `lactation-reassign-no-available-date`.
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: shiftExceptionId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Reasignación exitosa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 lactationPeriodId: { type: integer }
   *                 originalDate:
   *                   type: string
   *                   format: date
   *                   description: Fecha del día revocado.
   *                 reassignedToDate:
   *                   type: string
   *                   format: date
   *                   description: Nueva fecha en la que se aplicará la reducción.
   *                 newEndDate:
   *                   type: string
   *                   format: date
   *                   description: Nuevo `employee_lactation_period_end_date` del periodo.
   *                 newLactationShiftExceptionId: { type: integer }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' en el módulo employees }
   *       '404': { description: Periodo o conflicto inexistente / ajeno a la empresa (key `lactation-conflict-not-found`) }
   *       '422':
   *         description: |
   *           No fue posible reasignar: cap de 24 meses excedido (`lactation-reassign-exceeds-max-range`),
   *           sin día disponible en el horizonte (`lactation-reassign-no-available-date`),
   *           o sin shift activo en la fecha calculada (`lactation-period-no-active-shift`).
   */
  async reassignConflict(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const shiftExceptionId = this.parseResourceId(params.shiftExceptionId)
      const service = new EmployeeLactationPeriodConflictService(ctx.i18n)
      const result = await service.reassign(id, shiftExceptionId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Conflicts',
        'Día de lactancia reasignado correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/conflicts:
   *   get:
   *     summary: Listado GLOBAL de conflictos de lactancia (vista a nivel empresa)
   *     description: |
   *       Devuelve, agrupado por periodo de lactancia, todos los
   *       conflictos activos de la empresa filtrados por el scope
   *       multitenant del usuario. Cada grupo incluye los datos
   *       mínimos de la empleada (nombre, código, BU) y la lista de
   *       conflictos del periodo. Útil para que RH vea de un vistazo
   *       todos los choques pendientes sin entrar al perfil de cada
   *       empleada.
   *
   *       Paginación: por GRUPO (periodo), no por día. Si filtras por
   *       `conflictType` se aplica DENTRO de cada grupo y se omiten
   *       los grupos que queden con 0 conflictos tras el filtro.
   *
   *       Multitenant: `businessUnitId` acota al selector del header
   *       global y debe pertenecer al scope del usuario (si no, se
   *       ignora y se usa el scope completo).
   *     tags: [EmployeeLactationPeriods]
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
   *         name: businessUnitId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: employeeId
   *         required: false
   *         schema: { type: integer }
   *       - in: query
   *         name: conflictType
   *         required: false
   *         schema:
   *           type: string
   *           enum: [vacation, work_disability, maternity, rest_or_permission, holiday]
   *       - in: query
   *         name: from
   *         required: false
   *         schema: { type: string, format: date }
   *       - in: query
   *         name: to
   *         required: false
   *         schema: { type: string, format: date }
   *     responses:
   *       '200': { description: Listado paginado de grupos de conflictos por periodo }
   *       '400': { description: Validación inválida }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo employees }
   */
  async listAllConflicts(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const filters = await request.validateUsing(
        employeeLactationPeriodConflictsListValidator
      )

      const fromDt = filters.from
        ? DateTime.fromJSDate(filters.from as unknown as Date).toUTC().startOf('day')
        : null
      const toDt = filters.to
        ? DateTime.fromJSDate(filters.to as unknown as Date).toUTC().startOf('day')
        : null

      const service = new EmployeeLactationPeriodConflictService(ctx.i18n)
      const result = await service.listGlobal(
        {
          page: filters.page,
          limit: filters.limit,
          businessUnitId: filters.businessUnitId,
          employeeId: filters.employeeId,
          conflictType: filters.conflictType as
            | 'vacation'
            | 'work_disability'
            | 'maternity'
            | 'rest_or_permission'
            | 'holiday'
            | undefined,
          from: fromDt,
          to: toDt,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Conflicts',
        'Conflictos de lactancia obtenidos correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{id}/conflicts/reassign-bulk:
   *   post:
   *     summary: Reasignación BULK de varios días de un mismo periodo en una sola transacción atómica
   *     description: |
   *       Procesa hasta 50 días de lactancia conflictivos en orden,
   *       cada uno al siguiente día disponible después del end_date
   *       actual (que se va acumulando paso a paso). Una sola
   *       transacción: si CUALQUIER reasignación falla (cap de 24
   *       meses, sin día disponible, conflicto inexistente, etc.) se
   *       revierte TODO y ninguna fila queda alterada.
   *
   *       Pensado para casos donde la empleada tiene varios choques
   *       seguidos (ej. semana de vacaciones encima del periodo de
   *       lactancia) y compensar uno a uno por endpoint sería
   *       tedioso.
   *     tags: [EmployeeLactationPeriods]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               shiftExceptionIds:
   *                 type: array
   *                 minItems: 1
   *                 maxItems: 50
   *                 items: { type: integer }
   *     responses:
   *       '200':
   *         description: Reasignación bulk exitosa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 lactationPeriodId: { type: integer }
   *                 totalRequested: { type: integer }
   *                 successCount: { type: integer }
   *                 newEndDate: { type: string, format: date }
   *                 reassignments:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       originalDate: { type: string, format: date }
   *                       reassignedToDate: { type: string, format: date }
   *                       newEndDate: { type: string, format: date }
   *                       newLactationShiftExceptionId: { type: integer }
   *                 failures:
   *                   type: array
   *                   description: |
   *                     Pre-validaciones que rechazaron la operación SIN iniciar
   *                     transacción (todo-o-nada). Si está poblado, `successCount`
   *                     es 0 y no se modificó BD.
   *                   items:
   *                     type: object
   *                     properties:
   *                       shiftExceptionId: { type: integer }
   *                       errorCode: { type: string }
   *                       errorKey: { type: string, nullable: true }
   *                       message: { type: string }
   *       '400': { description: Validación inválida del body }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' en el módulo employees }
   *       '404': { description: Periodo inexistente o ajeno a la empresa }
   *       '422':
   *         description: |
   *           Reasignación abortada: cap de 24 meses excedido en algún paso
   *           (`lactation-reassign-exceeds-max-range`) o sin día disponible
   *           dentro del horizonte (`lactation-reassign-no-available-date`).
   */
  async reassignConflictsBulk(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'update'))) return

      const id = this.parseResourceId(params.id)
      const body = await request.validateUsing(
        employeeLactationPeriodConflictsReassignBulkValidator
      )

      const service = new EmployeeLactationPeriodConflictService(ctx.i18n)
      const result = await service.reassignBulk(id, body.shiftExceptionIds, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Conflicts',
        'Reasignación bulk procesada'
      )
    } catch (error) {
      return this.respondError(error, response, 500)
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Devuelve `true` si el usuario está autenticado; en caso contrario emite 401. */
  private async assertAuthenticated(ctx: HttpContext) {
    await ctx.auth.check()
    if (!ctx.auth.user) {
      ctx.response.status(401).json({
        type: 'error',
        title: 'No autorizado',
        message: 'Usuario no autenticado',
        errorCode: ELP_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  /**
   * Permite la operación si el usuario es root del tenant; de otro modo
   * verifica el permiso solicitado en el módulo. 403 si no aplica.
   */
  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'update' | 'delete'
  ) {
    const user = ctx.auth.user!
    await user.preload('role')
    const isRoot = user.role?.roleSlug === 'root'
    if (isRoot) {
      return true
    }
    const roleService = new RoleService()
    const permissionSlug = ACTION_PERMISSION_MAP[action]
    const allowed = await roleService.hasAccess(
      user.roleId,
      PARENT_MODULE_SLUG,
      permissionSlug
    )
    if (!allowed) {
      ctx.response.status(403).json({
        type: 'error',
        title: 'Sin permiso',
        message: 'No tienes permiso para esta operación sobre periodos de lactancia.',
        key: 'sin-permiso',
        errorCode: ELP_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new EmployeeLactationPeriodError(
        'El identificador del periodo es inválido.',
        ELP_ERROR_CODES.VAL_INPUT,
        400
      )
    }
    return id
  }

  private toCreatePayload(body: Record<string, unknown>): EmployeeLactationPeriodCreatePayload {
    return {
      employeeId: Number(body.employeeId),
      employeeLactationPeriodStartDate: this.dateLikeToIso(
        body.employeeLactationPeriodStartDate
      ),
      employeeLactationPeriodEndDate: this.dateLikeToIso(
        body.employeeLactationPeriodEndDate
      ),
      employeeLactationPeriodType:
        body.employeeLactationPeriodType as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodType'],
      employeeLactationPeriodReductionApplication:
        body.employeeLactationPeriodReductionApplication as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodReductionApplication'],
      employeeLactationPeriodNotes:
        body.employeeLactationPeriodNotes === undefined
          ? null
          : (body.employeeLactationPeriodNotes as string | null),
      // Acepta `null` (sin vínculo) y números (vínculo al hijo).
      // `undefined` se traduce a `null` en create porque es alta nueva.
      employeeChildrenId:
        body.employeeChildrenId === undefined || body.employeeChildrenId === null
          ? null
          : Number(body.employeeChildrenId),
    }
  }

  private toUpdatePayload(body: Record<string, unknown>): EmployeeLactationPeriodUpdatePayload {
    const payload: EmployeeLactationPeriodUpdatePayload = {}
    if (body.employeeId !== undefined) {
      payload.employeeId = Number(body.employeeId)
    }
    if (body.employeeLactationPeriodStartDate !== undefined) {
      payload.employeeLactationPeriodStartDate = this.dateLikeToIso(
        body.employeeLactationPeriodStartDate
      )
    }
    if (body.employeeLactationPeriodEndDate !== undefined) {
      payload.employeeLactationPeriodEndDate = this.dateLikeToIso(
        body.employeeLactationPeriodEndDate
      )
    }
    if (body.employeeLactationPeriodType !== undefined) {
      payload.employeeLactationPeriodType =
        body.employeeLactationPeriodType as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodType']
    }
    if (body.employeeLactationPeriodReductionApplication !== undefined) {
      payload.employeeLactationPeriodReductionApplication =
        body.employeeLactationPeriodReductionApplication as EmployeeLactationPeriodCreatePayload['employeeLactationPeriodReductionApplication']
    }
    if (body.employeeLactationPeriodNotes !== undefined) {
      payload.employeeLactationPeriodNotes = body.employeeLactationPeriodNotes as
        | string
        | null
    }
    // Distinguimos los tres casos del patch parcial:
    //   - ausente (`undefined`) → no se toca.
    //   - explícito `null`      → se desvincula (persiste null).
    //   - número                 → se valida pertenencia y se vincula.
    if (body.employeeChildrenId !== undefined) {
      payload.employeeChildrenId =
        body.employeeChildrenId === null ? null : Number(body.employeeChildrenId)
    }
    return payload
  }

  /**
   * Vine convierte `vine.date()` a un `Date` JS. Aquí lo normalizamos al
   * formato ISO YYYY-MM-DD que consume el servicio.
   */
  private dateLikeToIso(value: unknown): string {
    if (value instanceof Date) {
      const iso = value.toISOString()
      return iso.substring(0, 10)
    }
    return String(value)
  }

  /**
   * Convierte la salida del validador del reporte (`from`/`to` como `Date`
   * JS, `status` como string del set cerrado) al shape `ComplianceReportFilters`
   * que espera el servicio. Mantiene esta transformación encapsulada para
   * que el service no tenga que conocer detalles del runtime de Vine.
   */
  private toReportFilters(
    raw: Awaited<ReturnType<typeof employeeLactationComplianceReportValidator.validate>>
  ): ComplianceReportFilters {
    const toDateTime = (value: unknown): DateTime | null => {
      if (!value) return null
      if (value instanceof Date) {
        return DateTime.fromJSDate(value).toUTC().startOf('day')
      }
      if (typeof value === 'string') {
        return DateTime.fromISO(value, { zone: 'utc' }).startOf('day')
      }
      return null
    }

    const allowedStatuses = LACTATION_COMPLIANCE_STATUS_VALUES as readonly string[]
    const status =
      typeof raw.status === 'string' && allowedStatuses.includes(raw.status)
        ? (raw.status as ComplianceReportFilters['status'])
        : undefined

    return {
      page: raw.page,
      limit: raw.limit,
      status,
      from: toDateTime(raw.from),
      to: toDateTime(raw.to),
      employeeId: raw.employeeId,
      businessUnitId: raw.businessUnitId,
    }
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number
  ) {
    const resolved = resolveEmployeeLactationPeriodApiError(error, fallback)
    if (resolved.key) {
      const titleByCode: Partial<Record<string, string>> = {
        [ELP_ERROR_CODES.PERIOD_OVERLAP]: 'Periodo de lactancia traslapado',
        [ELP_ERROR_CODES.RANGE_UNREASONABLE]: 'Rango de lactancia inverosímil',
        [ELP_ERROR_CODES.RANGE_BELOW_LEGAL_MINIMUM]:
          'Periodo de lactancia por debajo del mínimo legal',
        [ELP_ERROR_CODES.EXCEPTION_TYPE_MISSING]:
          'Tipo de excepción de lactancia no configurado',
        [ELP_ERROR_CODES.NO_ACTIVE_SHIFT]:
          'Empleada sin turno activo en el rango del periodo',
        [ELP_ERROR_CODES.CONFLICT_NOT_FOUND]:
          'Conflicto de lactancia inexistente o ya resuelto',
        [ELP_ERROR_CODES.REASSIGN_EXCEEDS_MAX_RANGE]:
          'La reasignación excede el máximo de 24 meses del periodo',
        [ELP_ERROR_CODES.REASSIGN_NO_AVAILABLE_DATE]:
          'Sin día disponible para reasignar dentro del horizonte de búsqueda',
        [ELP_ERROR_CODES.CHILD_NOT_OWNED]:
          'Hijo no pertenece a la empleada del periodo',
      }
      return response.status(resolved.status).json({
        type: 'error',
        title: titleByCode[resolved.errorCode] ?? 'Error',
        key: resolved.key,
        detail: resolved.message,
        message: resolved.message,
        errorCode: resolved.errorCode,
        data: null,
      })
    }
    return StandardResponseFormatter.error(
      response,
      resolved.message,
      resolved.status,
      resolved.errorCode
    )
  }
}
