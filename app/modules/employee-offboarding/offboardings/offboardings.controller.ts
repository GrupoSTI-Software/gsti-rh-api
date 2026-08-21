import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import OffboardingsService from './offboardings.service.js'
import { scheduleOffboardingValidator } from './validators/schedule_offboarding.validator.js'

/** Ramos genéricos del resolvedor con los códigos del slice del expediente. */
const CASE_FALLBACKS: EmployeeOffboardingErrorFallbacks = {
  valInputCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
  unexpectedCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_UNEXPECTED,
  unexpectedKey: 'error-interno',
}

/**
 * Expediente de salida por colaborador (USRH1786568279587). Errores siempre
 * `{ title, detail, key, code }`: el BO ramifica por `key`.
 */
export default class OffboardingsController {
  /**
   * @swagger
   * /api/employee-offboardings:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Programa la baja de un colaborador y abre su expediente de salida
   *     description: |
   *       Abre el expediente con origen `scheduled` y genera sus pendientes
   *       UNA sola vez: uno por cada concepto activo del catálogo de la
   *       empresa del colaborador y uno por cada activo asignado (entregado o
   *       en tránsito). El nombre de cada pendiente es snapshot del momento.
   *       Programar NO modifica al colaborador ni su estatus (regla 2).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema: { type: string, format: uuid }
   *         description: UUID público de la razón social activa
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [employeeId, plannedDate]
   *             properties:
   *               employeeId: { type: integer }
   *               plannedDate: { type: string, format: date, description: 'YYYY-MM-DD' }
   *               notes: { type: string, maxLength: 1000 }
   *     responses:
   *       201:
   *         description: Expediente abierto en data.employeeOffboarding, con sus pendientes
   *       400:
   *         description: Cuerpo mal formado (key datos-invalidos)
   *       404:
   *         description: Colaborador inexistente o fuera del alcance (key colaborador-no-encontrado, uniforme)
   *       409:
   *         description: El colaborador ya tiene un expediente abierto (key expediente-ya-abierto)
   *       403:
   *         description: Sin permiso create sobre employee-offboardings (key sin-permiso)
   */
  async store({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new OffboardingsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'create')
      const data = await request.validateUsing(scheduleOffboardingValidator)
      const employeeOffboarding = await service.schedule(
        {
          employeeId: data.employeeId,
          plannedDate: data.plannedDate,
          notes: data.notes ?? null,
        },
        businessUnitScope,
        auth.user?.userId ?? null
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboarding,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_case_opened_message'),
        201,
        'employeeOffboarding'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/by-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Expediente de salida abierto del colaborador con sus pendientes
   *     description: |
   *       Devuelve el expediente `open` con los pendientes ordenados por el
   *       lugar del concepto en el catálogo y la marca `isOverdue` por
   *       pendiente (regla 9: fecha real de baja si existe, si no la
   *       tentativa; "hoy" en zona America/Mexico_City). El colaborador se
   *       resuelve con withTrashed: el expediente sobrevive a la baja.
   *
   *       CONTRATO TRANSITORIO declarado: el 404 cuando no hay expediente
   *       `open` lo amplía USRH1786568279596 para devolver el más reciente
   *       aunque esté cerrado.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Expediente en data.employeeOffboarding
   *       404:
   *         description: Colaborador fuera del alcance (colaborador-no-encontrado) o sin expediente abierto (expediente-no-encontrado)
   *       403:
   *         description: Sin permiso read sobre employee-offboardings (key sin-permiso)
   */
  async byEmployee({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new OffboardingsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const employeeId = this.parseEmployeeId(request.param('employeeId'), i18n)
      const employeeOffboarding = await service.getByEmployee(employeeId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        employeeOffboarding,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_case_found_message'),
        200,
        'employeeOffboarding'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  private parseEmployeeId(rawId: string, i18n: HttpContext['i18n']): number {
    const employeeId = Number.parseInt(rawId, 10)
    if (!Number.isInteger(employeeId) || employeeId < 1) {
      throw new EmployeeOffboardingServiceError({
        key: 'datos-invalidos',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_VAL_INPUT,
        httpStatus: 400,
        title: i18n.formatMessage('employee_offboarding_val_input_title'),
        detail: i18n.formatMessage('employee_offboarding_val_input_message'),
      })
    }
    return employeeId
  }

  private respondWithError(
    response: HttpContext['response'],
    i18n: HttpContext['i18n'],
    error: unknown
  ) {
    const resolved = resolveEmployeeOffboardingApiError(error, i18n, CASE_FALLBACKS)
    response.status(resolved.status)
    return {
      title: resolved.title,
      detail: resolved.detail,
      key: resolved.key,
      code: resolved.code,
    }
  }
}
