import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { respondAdmsApiError } from '#helpers/adms_api_error'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import {
  ensureAccessPointPermission,
  resolveScopedAccessPoint,
  resolveScopedEmployee,
} from '#modules/access-point/access_point_authorization'
import { toDeviceCommandDto } from '#modules/device-commands/dto/device_command.dto'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import { DeviceCommandError } from '#exceptions/device_command_error'
import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import FingerprintEnrollmentService from '../enrollment/fingerprint_enrollment.service.js'
import DeviceFaceService from '../photo/device_face.service.js'
import ReplicationService from '../replication/replication.service.js'
import { FINGER_ID_MAX, FINGER_ID_MIN } from '../enrollment/fingerprint_enrollment.constants.js'

const employeeValidator = vine.compile(
  vine.object({ params: vine.object({ employeeId: vine.number().positive() }) })
)

const enableFaceValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().positive() }),
    /** Vacio o ausente: se publica hacia los equipos ya confirmados. */
    accessPointIds: vine.array(vine.number().positive()).optional(),
  })
)

const replicationValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().positive() }),
    sourceAccessPointId: vine.number().positive(),
    targetAccessPointIds: vine.array(vine.number().positive()).minLength(1),
    modalities: vine.array(vine.enum(['fingerprint', 'face'] as const)).optional(),
  })
)

const enrollmentStatusValidator = vine.compile(
  vine.object({
    params: vine.object({
      employeeId: vine.number().positive(),
      commandId: vine.number().positive(),
    }),
  })
)

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

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/replicate:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: Copia los biometricos del colaborador de un checador a otros
   *     responses:
   *       200:
   *         description: Desglose por equipo destino en data.results
   *       422:
   *         description: Sin consentimiento (key consentimiento-faltante)
   */
  async replicate(ctx: HttpContext) {
    return this.runReplication(ctx, false)
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/replication-preview:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: El mismo desglose sin encolar nada
   *     responses:
   *       200:
   *         description: Desglose por equipo destino en data.preview
   */
  async replicationPreview(ctx: HttpContext) {
    return this.runReplication(ctx, true)
  }

  /**
   * La vista previa corre EL MISMO camino que la replicacion real, con el
   * encolado apagado. Si fueran dos caminos distintos, el operador veria un
   * desglose y ocurriria otro.
   */
  private async runReplication(ctx: HttpContext, dryRun: boolean) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        dryRun
          ? EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBiometrics
          : EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric
      )
      const payload = await request.validateUsing(replicationValidator, {
        data: {
          params: request.params(),
          sourceAccessPointId: request.input('sourceAccessPointId'),
          targetAccessPointIds: request.input('targetAccessPointIds'),
          modalities: request.input('modalities'),
        },
      })

      const employee = await resolveScopedEmployee(ctx, payload.params.employeeId)
      /** Origen y destinos, todos resueltos dentro del alcance antes de tocar nada. */
      const source = await resolveScopedAccessPoint(ctx, payload.sourceAccessPointId)
      const targetAccessPointIds: number[] = []
      for (const accessPointId of payload.targetAccessPointIds) {
        const target = await resolveScopedAccessPoint(ctx, accessPointId)
        targetAccessPointIds.push(target.accessPointId)
      }

      const service = new ReplicationService()
      const result = await service.replicate({
        employeeId: employee.employeeId,
        businessUnitId: employee.businessUnitId as number,
        sourceAccessPointId: source.accessPointId,
        targetAccessPointIds,
        modalities: payload.modalities ?? [],
        actor: {
          userId: auth.user?.userId ?? null,
          ip: request.ip(),
          userAgent: request.header('user-agent') ?? null,
          requestId: request.id() ?? null,
        },
        dryRun,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.formatMessage('biometric_vault_title'),
        i18n.formatMessage(
          dryRun ? 'biometric_replication_preview_message' : 'biometric_replication_message'
        ),
        200,
        dryRun ? 'preview' : 'results'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/commands/{commandId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: Estado del comando que se le pidio al checador
   *     responses:
   *       200:
   *         description: El comando en data.command
   *       404:
   *         description: El comando no es de ese colaborador (key comando-no-encontrado)
   */
  /**
   * Como va la captura que se pidio.
   *
   * Cuelga del colaborador y pide el permiso de LECTURA de su pestaña de
   * biometricos, no el del catalogo de equipos: quien lanza una captura tiene
   * que poder ver como termino, y el permiso de la flota es de otro modulo --
   * exigirlo aqui dejaria al operador de RH mirando una espera que nunca cierra.
   *
   * El comando tiene que ser del colaborador del path. Uno de otra persona se
   * responde como inexistente en vez de negado: quien pregunta no tiene por que
   * enterarse de que ese identificador existe.
   */
  async enrollmentStatus(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeBiometrics
      )
      const payload = await request.validateUsing(enrollmentStatusValidator, {
        data: { params: request.params() },
      })

      const employee = await resolveScopedEmployee(ctx, payload.params.employeeId)

      const repository = new DeviceCommandRepositoryMysql()
      const command = await repository.findById(payload.params.commandId)
      if (!command || command.employeeId !== employee.employeeId) {
        throw new DeviceCommandError(
          'El comando no existe o no es de ese colaborador',
          DEVICE_COMMAND_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
          404,
          'comando-no-encontrado',
          'La captura que consultas no existe para este colaborador.'
        )
      }

      // El equipo se vuelve a resolver con el alcance de la peticion: la fila
      // del comando guarda su identificador, no el permiso para verlo.
      const accessPoint = await resolveScopedAccessPoint(ctx, command.accessPointId)

      return StandardResponseFormatter.success(
        response,
        toDeviceCommandDto(command, accessPoint.accessPointLastConnection ?? null, DateTime.utc()),
        i18n.formatMessage('device_command_title'),
        i18n.formatMessage('device_command_status_message'),
        200,
        'command'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/face/enable:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: Autoriza usar la foto del colaborador en los checadores
   *     responses:
   *       200:
   *         description: Version del derivado y destinos en data.deviceBiometrics
   *       422:
   *         description: Sin consentimiento, sin foto, o la foto no pasa la evaluacion (key foto-no-apta)
   *       500:
   *         description: La evaluacion no se pudo hacer; no es un rechazo de la foto
   */
  async enableFace(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric
      )
      const payload = await request.validateUsing(enableFaceValidator, {
        data: {
          params: request.params(),
          accessPointIds: request.input('accessPointIds'),
        },
      })
      const employee = await resolveScopedEmployee(ctx, payload.params.employeeId)

      /** Cada equipo del cuerpo se resuelve dentro del alcance antes de tocarlo. */
      const accessPointIds: number[] = []
      for (const accessPointId of payload.accessPointIds ?? []) {
        const accessPoint = await resolveScopedAccessPoint(ctx, accessPointId)
        accessPointIds.push(accessPoint.accessPointId)
      }

      const service = new DeviceFaceService()
      const result = await service.enable({
        employeeId: employee.employeeId,
        businessUnitId: employee.businessUnitId as number,
        accessPointIds,
        actorUserId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.formatMessage('biometric_vault_title'),
        i18n.formatMessage('device_face_enabled_message'),
        200,
        'deviceBiometrics'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }

  /**
   * @swagger
   * /api/v1/employees/{employeeId}/device-biometrics/face/disable:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags: [Biometricos]
   *     summary: Retira la foto del colaborador de los checadores
   *     responses:
   *       200:
   *         description: Publicaciones retiradas y borrados encolados en data.deviceBiometrics
   */
  async disableFace(ctx: HttpContext) {
    const { auth, request, response, i18n } = ctx
    try {
      await ensureAccessPointPermission(
        ctx,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric
      )
      const { params } = await request.validateUsing(employeeValidator, {
        data: { params: request.params() },
      })
      const employee = await resolveScopedEmployee(ctx, params.employeeId)

      const service = new DeviceFaceService()
      const result = await service.disable({
        employeeId: employee.employeeId,
        businessUnitId: employee.businessUnitId as number,
        actorUserId: auth.user?.userId ?? null,
      })

      return StandardResponseFormatter.success(
        response,
        result,
        i18n.formatMessage('biometric_vault_title'),
        i18n.formatMessage('device_face_disabled_message'),
        200,
        'deviceBiometrics'
      )
    } catch (error) {
      return respondAdmsApiError(response, i18n, error)
    }
  }
}
