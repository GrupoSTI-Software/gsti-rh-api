import { HttpContext } from '@adonisjs/core/http'
import { simulateAttendanceValidator } from './validators/simulate_attendance.validator.js'
import SimulateAttendanceService from './simulate_attendance.service.js'

/**
 * Controlador del paso "simulate-attendance" del onboarding (rama attendance).
 *
 * Genera un par de asistencias simuladas (entrada + salida) para el empleado
 * indicado en la fecha elegida por el admin, usando los horarios del turno.
 * Los registros quedan en la tabla `assists` con `assistAreaAlias = 'Onboarding Simulado'`
 * para distinguirlos de asistencias reales.
 */
export default class SimulateAttendanceController {
  /**
   * @swagger
   * /api/onboarding/me/simulate-attendance:
   *   post:
   *     tags:
   *       - Onboarding
   *     summary: Generar asistencias simuladas para el empleado del onboarding
   *     description: |
   *       Crea dos registros de asistencia simulados (entrada y salida) para el
   *       empleado indicado en la fecha elegida, usando el horario del turno asignado.
   *       Estos registros son identificables por `assistAreaAlias = 'Onboarding Simulado'`.
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
   *               - shiftId
   *               - date
   *             properties:
   *               employeeId:
   *                 type: integer
   *               shiftId:
   *                 type: integer
   *               date:
   *                 type: string
   *                 format: date
   *                 example: "2026-06-24"
   *     responses:
   *       '200':
   *         description: Asistencias simuladas generadas correctamente
   *       '404':
   *         description: Empleado o turno no encontrado
   *       '422':
   *         description: Parámetros inválidos
   */
  async create({ request, response, i18n }: HttpContext) {
    let payload: { employeeId: number; shiftId: number; date: string }
    try {
      payload = await simulateAttendanceValidator.validate(request.all())
    } catch {
      response.status(422)
      return {
        type: 'error',
        title: i18n.formatMessage('onboarding.simulate_invalid_params_title'),
        detail: i18n.formatMessage('onboarding.simulate_invalid_params_detail'),
        key: 'SIMULATE.INVALID_PARAMS',
        data: null,
      }
    }

    try {
      const service = new SimulateAttendanceService()
      const result = await service.simulate(payload)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('onboarding.simulate_success_title'),
        detail: i18n.formatMessage('onboarding.simulate_success_detail'),
        data: result,
      }
    } catch (error: any) {
      if (error?.code === 'EMPLOYEE_NOT_FOUND') {
        response.status(404)
        return {
          type: 'error',
          title: i18n.formatMessage('onboarding.simulate_employee_not_found_title'),
          detail: i18n.formatMessage('onboarding.simulate_employee_not_found_detail'),
          key: 'SIMULATE.EMPLOYEE_NOT_FOUND',
          data: null,
        }
      }
      if (error?.code === 'SHIFT_NOT_FOUND') {
        response.status(404)
        return {
          type: 'error',
          title: i18n.formatMessage('onboarding.simulate_shift_not_found_title'),
          detail: i18n.formatMessage('onboarding.simulate_shift_not_found_detail'),
          key: 'SIMULATE.SHIFT_NOT_FOUND',
          data: null,
        }
      }
      response.status(500)
      return {
        type: 'error',
        title: i18n.formatMessage('server_error'),
        detail: i18n.formatMessage('an_unexpected_error_has_occurred_on_the_server'),
        key: 'SIMULATE.INTERNAL_ERROR',
        data: null,
      }
    }
  }
}
