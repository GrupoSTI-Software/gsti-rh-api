import type { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError, respondFileIntakeError } from '#helpers/file_intake_api_error'
import RoleService from '#services/role_service'
import EmployeeLactationPeriodEvidenceService from '#services/employee_lactation_period_evidence_service'
import { employeeLactationPeriodEvidenceUploadValidator } from '#validators/employee_lactation_period_evidence'
import type { EmployeeLactationPeriodEvidenceCategory } from '#models/employee_lactation_period_evidence'
import { ELPE_ERROR_CODES } from '../constants/employee_lactation_period_evidence_error_codes.js'
import { EmployeeLactationPeriodEvidenceError } from '../exceptions/employee_lactation_period_evidence_error.js'
import { resolveEmployeeLactationPeriodEvidenceApiError } from '../helpers/employee_lactation_period_evidence_api_error.js'
import { StandardResponseFormatter } from '../helpers/standard_response_formatter.js'

/**
 * Sigue el mismo criterio de permisos que `EmployeeLactationPeriodsController`:
 * las evidencias no tienen módulo propio en `system_modules`, viven embebidas
 * en el apartado "Información del empleado". Por eso los checks de RBAC se
 * hacen contra el módulo `employees`:
 *  - listar / consultar / descargar  → permiso `read`.
 *  - subir / eliminar → permiso `update-information`
 *    (mismo permiso que usa el CRUD del propio periodo).
 */
const PARENT_MODULE_SLUG = 'employees'
const ACTION_PERMISSION_MAP: Record<'read' | 'create' | 'delete', string> = {
  read: 'read',
  create: 'update-information',
  delete: 'update-information',
}

/**
 * Controlador REST de las evidencias documentales adjuntas a un periodo de
 * lactancia. Expone 4 endpoints anidados bajo
 * `/api/employee-lactation-periods/:periodId/evidences`.
 *
 * Reglas:
 *  - Aisla por empresa (vía `EmployeeLactationPeriodEvidenceService` que
 *    delega en `EmployeeLactationPeriodService.ensurePeriodAccessible`).
 *  - Sólo PDFs hasta 10 MB.
 *  - Soft delete (NO borra el objeto S3, sólo la fila en BD).
 *  - Las URLs de descarga son firmadas y duran 5 minutos.
 */
export default class EmployeeLactationPeriodEvidencesController {
  /**
   * @swagger
   * /api/employee-lactation-periods/{periodId}/evidences:
   *   get:
   *     summary: Lista las evidencias documentales del periodo
   *     tags: [EmployeeLactationPeriodEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: periodId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Listado ordenado por fecha de creación DESC }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' en el módulo }
   *       '404': { description: Periodo inexistente o ajeno a la empresa }
   */
  async index(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const periodId = this.parseResourceId(params.periodId)
      const service = new EmployeeLactationPeriodEvidenceService()
      const rows = await service.listByPeriod(periodId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        rows,
        'Employee Lactation Period Evidences',
        'Evidencias del periodo de lactancia obtenidas correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{periodId}/evidences:
   *   post:
   *     summary: Sube una evidencia PDF al periodo de lactancia
   *     description: |
   *       Acepta archivos PDF de hasta 10 MB. La categoría es opcional y por
   *       default se guarda como `other`. El archivo se almacena en S3 con
   *       permiso `private`; al cliente sólo se le devuelve metadata.
   *     tags: [EmployeeLactationPeriodEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: periodId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [file]
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *                 description: PDF de hasta 10 MB
   *               employeeLactationPeriodEvidenceCategory:
   *                 type: string
   *                 enum: [agreement, birth_support, other]
   *                 default: other
   *     responses:
   *       '201': { description: Evidencia subida y persistida }
   *       '400':
   *         description: |
   *           Validación de archivo o categoría. Posibles `key`:
   *           - `lactation-evidence-file-required`
   *           - `lactation-evidence-invalid-file-type`
   *           - `lactation-evidence-file-too-large`
   *           - `lactation-evidence-invalid-category`
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' }
   *       '404': { description: Periodo inexistente o ajeno a la empresa }
   *       '500':
   *         description: Fallo al subir el archivo a S3 (key `lactation-evidence-upload-failed`)
   */
  async store(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'create'))) return

      const periodId = this.parseResourceId(params.periodId)
      const body = await request.validateUsing(employeeLactationPeriodEvidenceUploadValidator)
      const file = request.file('file')

      const service = new EmployeeLactationPeriodEvidenceService()
      const created = await service.upload(
        periodId,
        file,
        {
          category: body.employeeLactationPeriodEvidenceCategory as
            | EmployeeLactationPeriodEvidenceCategory
            | undefined,
        },
        ctx.businessUnitScope
      )

      return StandardResponseFormatter.success(
        response,
        created,
        'Employee Lactation Period Evidence',
        'Evidencia subida correctamente',
        201
      )
    } catch (error) {
      return this.respondError(error, response, 400)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{periodId}/evidences/{evidenceId}/download-url:
   *   get:
   *     summary: URL firmada temporal para descargar una evidencia
   *     description: |
   *       Devuelve un enlace pre-firmado a S3 con vigencia de 5 minutos. El
   *       archivo nunca se sirve directamente desde la API.
   *     tags: [EmployeeLactationPeriodEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: periodId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: URL firmada generada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 downloadUrl: { type: string }
   *                 expiresInSeconds: { type: integer }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'read' }
   *       '404': { description: Periodo o evidencia inexistente }
   *       '500':
   *         description: Fallo al firmar la URL (key `lactation-evidence-download-failed`)
   */
  async downloadUrl(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'read'))) return

      const periodId = this.parseResourceId(params.periodId)
      const evidenceId = this.parseResourceId(params.evidenceId)

      const service = new EmployeeLactationPeriodEvidenceService()
      const result = await service.getDownloadUrl(periodId, evidenceId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        result,
        'Employee Lactation Period Evidence Download',
        'URL de descarga generada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
    }
  }

  /**
   * @swagger
   * /api/employee-lactation-periods/{periodId}/evidences/{evidenceId}:
   *   delete:
   *     summary: Soft delete de la evidencia
   *     description: |
   *       Borra la fila lógicamente (NO elimina el objeto en S3, para conservar
   *       trazabilidad de auditoría en caso de inspección STPS).
   *     tags: [EmployeeLactationPeriodEvidences]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: periodId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: evidenceId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200': { description: Borrado lógico aplicado }
   *       '401': { description: Sin autenticación }
   *       '403': { description: Sin permiso 'update-information' }
   *       '404': { description: Periodo o evidencia inexistente }
   */
  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      if (!(await this.assertAuthenticated(ctx))) return
      if (!(await this.assertHasPermission(ctx, 'delete'))) return

      const periodId = this.parseResourceId(params.periodId)
      const evidenceId = this.parseResourceId(params.evidenceId)

      const service = new EmployeeLactationPeriodEvidenceService()
      const deleted = await service.destroy(periodId, evidenceId, ctx.businessUnitScope)

      return StandardResponseFormatter.success(
        response,
        deleted,
        'Employee Lactation Period Evidence',
        'Evidencia eliminada correctamente'
      )
    } catch (error) {
      return this.respondError(error, response, 404)
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
        errorCode: ELPE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  /**
   * Permite la operación si el usuario es root del tenant; de otro modo
   * verifica el permiso solicitado en el módulo `employees`. 403 si no aplica.
   */
  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'create' | 'delete'
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
        message: 'No tienes permiso para esta operación sobre evidencias de lactancia.',
        key: 'sin-permiso',
        errorCode: ELPE_ERROR_CODES.FORBIDDEN,
        data: null,
      })
      return false
    }
    return true
  }

  private parseResourceId(raw: unknown) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) {
      throw new EmployeeLactationPeriodEvidenceError(
        'El identificador es inválido.',
        ELPE_ERROR_CODES.VAL_ID,
        400
      )
    }
    return id
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallback: number
  ) {
    // El rechazo de un archivo es 422 con triplete: sin esta rama el resolver
    // del modulo lo degrada a un 500 generico y el usuario nunca sabe que su
    // archivo fue rechazado ni por que.
    if (isFileIntakeError(error)) {
      return respondFileIntakeError(response, error)
    }

    const resolved = resolveEmployeeLactationPeriodEvidenceApiError(error, fallback)
    if (resolved.key) {
      const titleByCode: Partial<Record<string, string>> = {
        [ELPE_ERROR_CODES.PERIOD_NOT_FOUND]: 'Periodo no encontrado',
        [ELPE_ERROR_CODES.EVIDENCE_NOT_FOUND]: 'Evidencia no encontrada',
        [ELPE_ERROR_CODES.INVALID_FILE_TYPE]: 'Tipo de archivo no permitido',
        [ELPE_ERROR_CODES.FILE_TOO_LARGE]: 'Archivo demasiado grande',
        [ELPE_ERROR_CODES.VAL_CATEGORY]: 'Categoría inválida',
        [ELPE_ERROR_CODES.S3_OPERATION_FAILED]: 'Error con el almacenamiento de archivos',
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
