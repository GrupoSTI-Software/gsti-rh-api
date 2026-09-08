import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
  resolveScopedEmployee,
} from '#modules/access-point/access_point_authorization'
import { toDeviceCommandDto } from '#modules/device-commands/dto/device_command.dto'
import FingerprintEnrollmentService from '../enrollment/fingerprint_enrollment.service.js'
import { FINGER_ID_MAX, FINGER_ID_MIN } from '../enrollment/fingerprint_enrollment.constants.js'

const enrollmentValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().positive() }),
    accessPointId: vine.number().positive(),
    fingerId: vine.number().min(FINGER_ID_MIN).max(FINGER_ID_MAX),
  })
)

/**
 * Biometricos del colaborador en los equipos (spec ADMS 11).
 *
 * El permiso es el de la pestaña de biometricos del colaborador y no el del
 * catalogo de equipos: la operacion es sobre la persona.
 */
export default class DeviceBiometricsController {
  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/fingerprint-enrollment:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: Pide al checador que capture una huella con el dedo puesto
   *     responses:
   *       200:
   *         description: Comando encolado en data.command
   *       422:
   *         description: Sin consentimiento (key consentimiento-faltante) o sin PIN en el equipo (key sin-pin-en-el-equipo)
   *       404:
   *         description: El equipo o el colaborador no estan en el alcance
   */
  async enrollFingerprint(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric
      )
      const payload = await request.validateUsing(enrollmentValidator, {
        data: {
          params: request.params(),
          accessPointId: request.input('accessPointId'),
          fingerId: request.input('fingerId'),
        },
      })

      const accessPoint = await resolveScopedAccessPoint(ctx, payload.accessPointId)
      const employee = await resolveScopedEmployee(ctx, payload.params.employeeId)

      const service = new FingerprintEnrollmentService()
      const result = await service.request({
        accessPointId: accessPoint.accessPointId,
        businessUnitId: accessPoint.businessUnitId,
        employeeId: employee.employeeId,
        fingerId: payload.fingerId,
        requestedByUserId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        toDeviceCommandDto(result.command, accessPoint.accessPointLastConnection ?? null, DateTime.utc()),
        i18n.formatMessage('device_command_title'),
        i18n.formatMessage(
          result.created
            ? 'fingerprint_enrollment_queued_message'
            : 'fingerprint_enrollment_already_queued_message'
        ),
        200,
        'command'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}
