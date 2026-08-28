import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import {
  resolveEmployeeOffboardingApiError,
  type EmployeeOffboardingErrorFallbacks,
} from '#helpers/employee_offboarding_api_error'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import OffboardingsService from './offboardings.service.js'
import { listOffboardingsValidator } from './validators/list_offboardings.validator.js'
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
   *     summary: Expediente de salida del colaborador con pendientes y avance
   *     description: |
   *       Devuelve el expediente `open` — o, si no hay ninguno abierto, el
   *       MÁS RECIENTE aunque esté cerrado (cambio de contrato declarado por
   *       USRH1786568279596, regla 13) — con los pendientes ordenados, la
   *       marca `isOverdue` por pendiente (regla 9 + condición de expediente
   *       abierto) y el bloque de avance (itemsTotal/Completed/Open/Overdue).
   *       El colaborador se resuelve con withTrashed: el expediente
   *       sobrevive a la baja. El 404 queda SOLO para el colaborador que
   *       nunca tuvo expediente.
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Expediente en data.employeeOffboarding, con avance y rastro de cierre
   *       404:
   *         description: Colaborador fuera del alcance (colaborador-no-encontrado) o que nunca tuvo expediente (expediente-no-encontrado)
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

  /**
   * @swagger
   * /api/employee-offboardings:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Listado paginado de salidas con avance agregado
   *     description: |
   *       Un renglón por expediente del alcance de empresa, con el avance
   *       (itemsTotal, itemsCompleted, itemsOpen, itemsOverdue) resuelto en
   *       UNA sentencia agregada por página más la de conteo. Incluye a los
   *       colaboradores con la baja ya ejecutada (regla 5). "Atrasado" es la
   *       regla 9 de USRH1786568279587 más la condición de expediente
   *       abierto; un cerrado reporta itemsOverdue 0 e itemsOpen con lo que
   *       quedó sin cumplir. Orden: fecha de referencia descendente.
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, minimum: 1, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
   *       - in: query
   *         name: search
   *         schema: { type: string, maxLength: 100 }
   *         description: Nombre completo (LIKE) o código de nómina exacto
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [open, closed] }
   *       - in: query
   *         name: overdueOnly
   *         schema: { type: boolean }
   *     responses:
   *       200:
   *         description: data.employeeOffboardings con meta y data (renglones)
   *       400:
   *         description: Parámetros mal formados (key datos-invalidos)
   *       403:
   *         description: Sin permiso read sobre employee-offboardings (key sin-permiso)
   */
  async index({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new OffboardingsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'read')
      const filters = await request.validateUsing(listOffboardingsValidator)
      const result = await service.list(
        {
          page: filters.page ?? 1,
          limit: filters.limit ?? 20,
          search: filters.search,
          status: filters.status,
          overdueOnly: filters.overdueOnly,
        },
        businessUnitScope
      )
      return StandardResponseFormatter.success(
        response,
        { meta: result.meta, data: result.rows },
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_cases_listed_message'),
        200,
        'employeeOffboardings'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{employeeOffboardingId}/close:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Da por terminada la salida (cierre del expediente)
   *     description: |
   *       Marca el expediente como `closed` estampando quién lo cerró y
   *       cuándo (regla 7). NO toca los pendientes — los abiertos se
   *       conservan tal cual (regla 6) — ni al colaborador ni su inventario
   *       (regla 10). Sin cuerpo.
   *     parameters:
   *       - in: path
   *         name: employeeOffboardingId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Expediente cerrado en data.employeeOffboarding, con su avance
   *       404:
   *         description: Expediente inexistente o fuera del alcance (key expediente-no-encontrado)
   *       409:
   *         description: El expediente ya estaba cerrado (key expediente-ya-cerrado)
   *       403:
   *         description: Sin permiso update sobre employee-offboardings (key sin-permiso)
   */
  async close({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new OffboardingsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const employeeOffboardingId = this.parseEmployeeId(
        request.param('employeeOffboardingId'),
        i18n
      )
      const employeeOffboarding = await service.close(
        employeeOffboardingId,
        businessUnitScope,
        auth.user?.userId ?? null
      )
      return StandardResponseFormatter.success(
        response,
        employeeOffboarding,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_case_closed_message'),
        200,
        'employeeOffboarding'
      )
    } catch (error) {
      return this.respondWithError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/employee-offboardings/{employeeOffboardingId}/reopen:
   *   patch:
   *     security:
   *       - bearerAuth: []
   *     tags: [Expediente de salida]
   *     summary: Vuelve a abrir una salida terminada
   *     description: |
   *       Regresa el expediente a `open` y quita las marcas del cierre
   *       (regla 9); no hay bitácora — solo queda registrado el último
   *       cierre. Sin cuerpo.
   *     parameters:
   *       - in: path
   *         name: employeeOffboardingId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Expediente reabierto en data.employeeOffboarding
   *       404:
   *         description: Expediente inexistente o fuera del alcance (key expediente-no-encontrado)
   *       409:
   *         description: El expediente no está cerrado (key expediente-no-cerrado)
   *       403:
   *         description: Sin permiso update sobre employee-offboardings (key sin-permiso)
   */
  async reopen({ auth, request, response, i18n, businessUnitScope }: HttpContext) {
    try {
      const service = new OffboardingsService(i18n)
      await service.assertCanAccess(auth.user?.roleId, 'update')
      const employeeOffboardingId = this.parseEmployeeId(
        request.param('employeeOffboardingId'),
        i18n
      )
      const employeeOffboarding = await service.reopen(employeeOffboardingId, businessUnitScope)
      return StandardResponseFormatter.success(
        response,
        employeeOffboarding,
        i18n.formatMessage('employee_offboarding_case_title'),
        i18n.formatMessage('employee_offboarding_case_reopened_message'),
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
