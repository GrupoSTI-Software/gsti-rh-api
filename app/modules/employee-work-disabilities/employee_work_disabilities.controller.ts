import type { HttpContext } from '@adonisjs/core/http'
import Employee from '#models/employee'
import WorkDisability from '#models/work_disability'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
import WorkDisabilityFeedService from './work_disability_feed.service.js'
import { toIsoDay } from './work_disability_rules.js'
import WorkDisabilityRegistrationService, {
  type WorkDisabilityRegistrationResult,
} from './work_disability_registration.service.js'
import {
  employeeWorkDisabilityParamsValidator,
  registerWorkDisabilityExtensionValidator,
  registerWorkDisabilityValidator,
} from './employee_work_disabilities.validator.js'

/** Error con el triplete título/detalle/key del estándar. */
function fail(
  response: HttpContext['response'],
  status: number,
  title: string,
  detail: string,
  key: string,
  code: string
) {
  return response.status(status).json({ type: 'error', title, detail, key, code })
}

/** Documento del periodo: PDF o imagen, hasta 10 MB. */
const DOCUMENT_OPTIONS = { size: '10mb', extnames: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }

/**
 * Incapacidades de un colaborador desde su ficha.
 *
 * El permiso de cada ruta lo pone `permissionGate`; aquí se resuelve el
 * alcance: un colaborador de otra empresa responde 404, no 403, para no
 * confirmar que existe.
 */
export default class EmployeeWorkDisabilitiesController {
  /**
   * @swagger
   * /api/v1/employees/{employeeId}/work-disabilities:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Incapacidades]
   *     summary: Incapacidades del colaborador con periodos, gastos internos y seguimiento
   *     responses:
   *       200:
   *         description: data.workDisabilities, de la más reciente a la más antigua
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(employeeWorkDisabilityParamsValidator, {
      data: { params: request.params() },
    })
    const employee = await this.scopedEmployee(ctx, payload.params.employeeId)
    if (!employee) return this.notFound(response)

    const workDisabilities = await new WorkDisabilityFeedService().list(employee.employeeId)
    return StandardResponseFormatter.success(
      response,
      workDisabilities,
      'Incapacidades',
      'Incapacidades del colaborador',
      200,
      'workDisabilities'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/work-disabilities:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Incapacidades]
   *     summary: Registra una incapacidad con su periodo inicial y, opcionalmente, una nota
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [insuranceCoverageTypeId, startDate, days, document]
   *             properties:
   *               insuranceCoverageTypeId: { type: integer }
   *               folio: { type: string, description: 'Dos letras y seis dígitos; opcional en incapacidad interna' }
   *               startDate: { type: string, format: date }
   *               days: { type: integer, minimum: 1, maximum: 90 }
   *               note: { type: string }
   *               document: { type: string, format: binary }
   *     responses:
   *       201:
   *         description: data.workDisabilityId y data.workDisabilityPeriodId
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(registerWorkDisabilityValidator, {
      data: { ...request.all(), params: request.params() },
    })
    const employee = await this.scopedEmployee(ctx, payload.params.employeeId)
    if (!employee) return this.notFound(response)

    const document = this.document(ctx)
    if ('rejection' in document) return response.status(422).json(document.rejection)

    return this.respond(ctx, () =>
      new WorkDisabilityRegistrationService().register({
        ctx,
        employeeId: employee.employeeId,
        insuranceCoverageTypeId: payload.insuranceCoverageTypeId,
        folio: payload.folio || null,
        startDate: toIsoDay(payload.startDate),
        days: payload.days,
        note: payload.note ?? null,
        document: document.file,
      })
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/work-disabilities/{workDisabilityId}/extensions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Incapacidades]
   *     summary: Registra una ampliación (subsecuente, recaída o enlace) de la incapacidad
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [workDisabilityTypeId, startDate, days, document]
   *             properties:
   *               workDisabilityTypeId: { type: integer }
   *               folio: { type: string }
   *               startDate: { type: string, format: date }
   *               days: { type: integer, minimum: 1, maximum: 90 }
   *               document: { type: string, format: binary }
   *     responses:
   *       201:
   *         description: data.workDisabilityId y data.workDisabilityPeriodId
   */
  async extend(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(registerWorkDisabilityExtensionValidator, {
      data: { ...request.all(), params: request.params() },
    })
    const employee = await this.scopedEmployee(ctx, payload.params.employeeId)
    if (!employee) return this.notFound(response)

    const workDisability = await WorkDisability.query()
      .whereNull('work_disability_deleted_at')
      .where('work_disability_id', payload.params.workDisabilityId)
      .where('employee_id', employee.employeeId)
      .first()
    if (!workDisability) {
      return fail(
        response,
        404,
        'Incapacidad no encontrada',
        'La incapacidad no existe o no es de este colaborador.',
        'recurso-no-encontrado',
        WORK_DISABILITY_ERROR_CODES.NOT_FOUND
      )
    }

    const document = this.document(ctx)
    if ('rejection' in document) return response.status(422).json(document.rejection)

    return this.respond(ctx, () =>
      new WorkDisabilityRegistrationService().extend({
        ctx,
        workDisability,
        workDisabilityTypeId: payload.workDisabilityTypeId,
        folio: payload.folio || null,
        startDate: toIsoDay(payload.startDate),
        days: payload.days,
        document: document.file,
      })
    )
  }

  /** Corre el alta y traduce su resultado o sus rechazos conocidos a la respuesta. */
  private async respond(
    ctx: HttpContext,
    run: () => Promise<WorkDisabilityRegistrationResult>
  ) {
    try {
      const result = await run()
      if (!result.ok) return ctx.response.status(result.rejection.status).json(result.rejection.body)
      return StandardResponseFormatter.success(
        ctx.response,
        { workDisabilityId: result.workDisabilityId, workDisabilityPeriodId: result.workDisabilityPeriodId },
        'Incapacidades',
        'La incapacidad quedó registrada',
        201,
        'workDisability'
      )
    } catch (error) {
      // Rechazos del archivo y de escritura sensible tienen su propio formato.
      if (isFileIntakeError(error)) throw error
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      throw error
    }
  }

  /** El documento es obligatorio: sin él no se registra el periodo. */
  private document(ctx: HttpContext):
    | { file: NonNullable<ReturnType<HttpContext['request']['file']>> }
    | { rejection: { type: 'warning'; title: string; detail: string; key: string; code: string } } {
    const file = ctx.request.file('document', DOCUMENT_OPTIONS)
    if (!file || !file.isValid) {
      return {
        rejection: {
          type: 'warning',
          title: 'Documento requerido',
          detail: file?.errors[0]?.message ?? 'Adjunta el PDF o la foto del certificado, de hasta 10 MB.',
          key: 'documento-invalido',
          code: file && !file.isValid && file.size > 0 ? WORK_DISABILITY_ERROR_CODES.FILE_TOO_LARGE : WORK_DISABILITY_ERROR_CODES.INVALID_FILE,
        },
      }
    }
    return { file }
  }

  private async scopedEmployee(ctx: HttpContext, employeeId: number): Promise<Employee | null> {
    const scope = ctx.businessUnitScope ?? []
    if (scope.length === 0) return null
    return Employee.query()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', scope)
      .whereNull('employee_deleted_at')
      .first()
  }

  private notFound(response: HttpContext['response']) {
    return fail(
      response,
      404,
      'Colaborador no encontrado',
      'El colaborador no existe o no pertenece a tu empresa.',
      'colaborador-no-encontrado',
      WORK_DISABILITY_ERROR_CODES.NOT_FOUND
    )
  }
}
