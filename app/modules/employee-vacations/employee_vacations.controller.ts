import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_MANAGE_VACATION_PERMISSION } from '#constants/employees_write_permission_declarations'
import { assertDayWithinRoleScope } from '#modules/role-scope/day_scope_guard'
import ShiftExceptionRemovalService from '#services/shift_exception_removal_service'
import VacationDayFeedService from './vacation_day_feed.service.js'
import { vacationPeriodDates } from './vacation_period_dates.js'
import { cancelVacationDayValidator, vacationDaysQueryValidator } from './employee_vacations.validator.js'

/** Error con el triplete titulo/detalle/key del estandar. */
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

/**
 * Vacaciones de un colaborador vistas dia por dia (ficha del empleado).
 *
 * El permiso de la ruta lo pone `permissionGate`; aqui se resuelve el alcance:
 * un colaborador de otra empresa responde 404, no 403, para no confirmar que
 * existe.
 */
export default class EmployeeVacationsController {
  /**
   * @swagger
   * /api/v1/employees/{employeeId}/vacation-days:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Vacaciones]
   *     summary: Dias de vacaciones de un periodo con su estado, autorizacion y cancelacion
   *     parameters:
   *       - in: query
   *         name: vacationSettingId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: periodYear
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: data.vacationDays con pendientes, autorizados, rechazados y cancelados
   */
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    const payload = await request.validateUsing(vacationDaysQueryValidator, {
      data: { ...request.qs(), params: request.params() },
    })
    const employee = await this.scopedEmployee(ctx, payload.params.employeeId)
    if (!employee) return this.notFound(response)

    const hireDate = employee.employeeHireDate
    if (!hireDate) {
      return StandardResponseFormatter.success(response, [], 'Vacaciones', 'Sin fecha de ingreso', 200, 'vacationDays')
    }
    const period = vacationPeriodDates(
      DateTime.isDateTime(hireDate) ? hireDate : DateTime.fromISO(String(hireDate)),
      payload.periodYear
    )
    const vacationDays = await new VacationDayFeedService().list({
      employeeId: employee.employeeId,
      vacationSettingId: payload.vacationSettingId,
      periodStartsAt: period.periodStartsAt,
      periodEndsAt: period.periodEndsAt,
    })

    return StandardResponseFormatter.success(
      response,
      vacationDays,
      'Vacaciones',
      'Dias de vacaciones del periodo',
      200,
      'vacationDays'
    )
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/vacation-days/{shiftExceptionId}/cancel:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Vacaciones]
   *     summary: Cancela un dia de vacaciones autorizado, con motivo
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [reason]
   *             properties:
   *               reason: { type: string, minLength: 3, maxLength: 500 }
   *     responses:
   *       200:
   *         description: El dia quedo cancelado; deja de contar en saldo y asistencia
   *       404:
   *         description: El dia no existe, ya se cancelo o no es de vacaciones de ese colaborador
   */
  async cancel(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    const payload = await request.validateUsing(cancelVacationDayValidator, {
      data: { ...request.body(), params: request.params() },
    })
    const employee = await this.scopedEmployee(ctx, payload.params.employeeId)
    if (!employee) return this.notFound(response)

    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    const day = vacationType
      ? await ShiftException.query()
          .where('shift_exception_id', payload.params.shiftExceptionId)
          .where('employee_id', employee.employeeId)
          .where('exception_type_id', vacationType.exceptionTypeId)
          .whereNull('shift_exceptions_deleted_at')
          .first()
      : null
    if (!day) {
      return fail(
        response,
        404,
        'Día de vacaciones no encontrado',
        'El día no existe, ya se canceló o no es de vacaciones de este colaborador.',
        'dia-vacaciones-no-encontrado',
        'EVAC.CANCEL.001'
      )
    }

    if (!(await ensureSecondaryPermission(ctx, EMPLOYEES_MANAGE_VACATION_PERMISSION))) return

    const rejection = await assertDayWithinRoleScope({
      user: auth.user,
      employeeId: day.employeeId,
      day: day.shiftExceptionsDate,
      i18n,
    })
    if (rejection) return response.status(rejection.status).json(rejection.body)

    const cancelled = await new ShiftExceptionRemovalService().remove({
      shiftException: day,
      actorUserId: auth.user?.userId ?? null,
      rawHeaders: request.request.rawHeaders,
      reason: payload.reason,
      i18n,
    })

    return StandardResponseFormatter.success(
      response,
      {
        shiftExceptionId: cancelled.shiftExceptionId,
        cancelledAt: cancelled.shiftExceptionCancelledAt?.toISO() ?? null,
      },
      'Vacaciones',
      'Día de vacaciones cancelado',
      200,
      'vacationDay'
    )
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
      'EVAC.EMP.001'
    )
  }
}
