import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { errors as vineErrors } from '@vinejs/vine'
import { TenantContext } from '#utils/tenant_context'
import { EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS } from './employee_proceeding_file_summary.constants.js'
import { EmployeeProceedingFileSummaryError } from './employee_proceeding_file_summary.error.js'
import EmployeeProceedingFileSummaryService from './employee_proceeding_file_summary.service.js'
import { employeeProceedingFileSummaryParamsValidator } from './validators/employee_proceeding_file_summary_params.validator.js'

/**
 * Resumen del expediente de un empleado para la sección "Expediente" del
 * backoffice: evita pedir los archivos de cada carpeta solo para contarlos.
 */
@inject()
export default class EmployeeProceedingFileSummaryController {
  constructor(private readonly service: EmployeeProceedingFileSummaryService) {}

  /**
   * @swagger
   * /api/employees/{employeeId}/proceeding-file-summary:
   *   get:
   *     summary: Conteos del expediente de un empleado
   *     description: |
   *       Mismo permiso que `GET /employees/{employeeId}/proceeding-files`
   *       (`employees:tab-expediente-read`) y mismo árbol de carpetas que
   *       `GET /proceeding-file-types/by-area/employee`, ya filtrado para el
   *       empleado: una carpeta exclusiva solo cuenta si el empleado está
   *       asignado, y si no lo está se omite con todo su subárbol.
   *
   *       - `folders[]`: una fila por carpeta visible (raíz y subcarpetas).
   *         `documentsCount` = archivos directos (no recursivo);
   *         `subfoldersCount` = subcarpetas directas visibles.
   *       - `contracts.documents`: contratos del empleado (carpeta virtual
   *         "Contratos" del backoffice).
   *       - `totals.documents`: archivos de las carpetas visibles + contratos.
   *       - `totals.folders`: carpetas visibles + 1 (la carpeta de contratos).
   *       - `totals.expiringOrExpired`: archivos activos con vencimiento ya
   *         pasado o dentro de los próximos `windowDays` días naturales (zona
   *         de negocio, hoy inclusive). No incluye contratos.
   *     tags: [EmployeeProceedingFiles]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string }
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       '200':
   *         description: Resumen del expediente.
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               title: Expediente
   *               message: Resumen del expediente obtenido correctamente
   *               data:
   *                 windowDays: 30
   *                 totals: { documents: 9, folders: 4, expiringOrExpired: 2 }
   *                 contracts: { documents: 2 }
   *                 folders:
   *                   - { proceedingFileTypeId: 12, documentsCount: 3, subfoldersCount: 2 }
   *                   - { proceedingFileTypeId: 31, documentsCount: 1, subfoldersCount: 0 }
   *                   - { proceedingFileTypeId: 32, documentsCount: 3, subfoldersCount: 0 }
   *       '403':
   *         description: Sin `employees:tab-expediente-read` (gate).
   *       '404':
   *         description: "Empleado inexistente o de otra empresa (`key: empleado-no-encontrado`)."
   *       '422':
   *         description: "`employeeId` inválido (`key: entrada-invalida`)."
   *       '500':
   *         description: "Error inesperado (`key: error-inesperado`)."
   */
  async show(ctx: HttpContext) {
    const { params, response, i18n } = ctx
    try {
      const { employeeId } = await employeeProceedingFileSummaryParamsValidator.validate(params)
      const data = await this.service.summarize({
        employeeId,
        businessUnitIds: TenantContext.getScope(),
      })
      return response.status(200).json({
        type: 'success',
        title: i18n.t('employee_proceeding_file_summary_title', undefined, 'Expediente'),
        message: i18n.t(
          'employee_proceeding_file_summary_found_successfully',
          undefined,
          'Resumen del expediente obtenido correctamente'
        ),
        data,
      })
    } catch (error) {
      return this.respondError(ctx, error)
    }
  }

  /** Contrato de error del repo: `type/title/message/detail/key`. */
  private respondError(ctx: HttpContext, error: unknown) {
    const { response, i18n } = ctx

    if (error instanceof EmployeeProceedingFileSummaryError) {
      const detail = i18n.t(`${error.i18nPrefix}_detail`, undefined, error.fallbackDetail)
      return response.status(error.httpStatus).json({
        type: 'error',
        title: i18n.t(`${error.i18nPrefix}_title`, undefined, error.fallbackTitle),
        message: detail,
        detail,
        key: error.key,
        data: null,
      })
    }

    if (error instanceof vineErrors.E_VALIDATION_ERROR) {
      const detail = i18n.t(
        'employee_proceeding_file_summary_invalid_input_detail',
        undefined,
        'El identificador del empleado no es válido.'
      )
      return response.status(422).json({
        type: 'error',
        title: i18n.t(
          'employee_proceeding_file_summary_invalid_input_title',
          undefined,
          'Datos inválidos'
        ),
        message: detail,
        detail,
        key: EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS.INVALID_INPUT,
        data: null,
      })
    }

    logger.error({ err: error }, 'Resumen del expediente: error inesperado')
    const detail = i18n.t(
      'employee_proceeding_file_summary_unexpected_error_detail',
      undefined,
      'Ocurrió un error inesperado al consultar el expediente.'
    )
    return response.status(500).json({
      type: 'error',
      title: i18n.t(
        'employee_proceeding_file_summary_unexpected_error_title',
        undefined,
        'Error inesperado'
      ),
      message: detail,
      detail,
      key: EMPLOYEE_PROCEEDING_FILE_SUMMARY_ERROR_KEYS.UNEXPECTED,
      data: null,
    })
  }
}
