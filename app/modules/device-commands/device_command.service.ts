import { DateTime } from 'luxon'
import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import { DeviceCommandError } from '#exceptions/device_command_error'
import type DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_MAX_ATTEMPTS,
  DEVICE_COMMAND_PRIORITY,
  DEVICE_COMMAND_STATUS,
  DEVICE_COMMAND_WIRE_ID_RETRIES,
  type DeviceCommandStatus,
} from './device_command.constants.js'
import DeviceCommandRepositoryMysql from './device_command.repository.mysql.js'
import { canTransition } from './device_command.state.js'
import { formatDeviceCommand } from './wire/adms_command_formatter.js'
import type { DeviceCommandRepository } from './device_command.repository.js'
import type {
  DeviceCommandPort,
  EnqueueCommandInput,
  EnqueueCommandResult,
} from './device_command_port.js'

/**
 * Cola de ordenes hacia el checador (spec ADMS 6).
 *
 * Dos invariantes gobiernan la clase: una orden no se duplica (idempotencia por
 * llave de correlacion bajo bloqueo del dispositivo) y una orden no cambia de
 * estado por caminos que la maquina no permite.
 */
export default class DeviceCommandService implements DeviceCommandPort {
  constructor(
    private readonly repository: DeviceCommandRepository = new DeviceCommandRepositoryMysql(),
    private readonly now: () => DateTime = () => DateTime.utc(),
    private readonly clockMillis: () => number = () => Date.now()
  ) {}

  async enqueue(input: EnqueueCommandInput): Promise<EnqueueCommandResult> {
    const payload = formatDeviceCommand(input.kind, input.fields)
    const priority = input.priority ?? DEVICE_COMMAND_PRIORITY[input.kind]
    const maxAttempts =
      input.maxAttempts !== undefined
        ? input.maxAttempts
        : this.defaultMaxAttempts(input.kind)

    /**
     * El identificador de cable arranca en el reloj y sube de uno en uno ante
     * colision: el acuse del equipo solo trae ese numero, asi que dos comandos
     * no pueden compartirlo ni siquiera entre dispositivos distintos.
     */
    const base = this.clockMillis()
    const wireIdCandidates = Array.from(
      { length: DEVICE_COMMAND_WIRE_ID_RETRIES },
      (_unused, index) => base + index
    )

    const result = await this.repository.enqueueIdempotent(
      {
        accessPointId: input.accessPointId,
        businessUnitId: input.businessUnitId,
        kind: input.kind,
        payload,
        /**
         * El PIN y el numero de biometrico se copian de los campos ya
         * formateados: son los mismos que van dentro del payload cifrado, y
         * aqui quedan legibles para que la evidencia los correlacione.
         */
        pin: input.fields.pin ?? null,
        bioNo: input.fields.bioNo ?? input.fields.fid ?? null,
        priority,
        maxAttempts,
        employeeId: input.employeeId ?? null,
        accessPointEmployeeId: input.accessPointEmployeeId ?? null,
        correlationKey: input.correlationKey ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        biometricTemplateId: input.biometricTemplateId ?? null,
        biometricPhotoPublicationId: input.biometricPhotoPublicationId ?? null,
      },
      wireIdCandidates
    )

    if (!result) {
      throw new DeviceCommandError(
        'No se pudo asignar un identificador libre para el comando',
        DEVICE_COMMAND_ERROR_CODES.SYS_WIRE_ID,
        500,
        'identificador-ocupado'
      )
    }
    return result
  }

  /** `user_delete` no tiene tope: dejar a un ex-colaborador dentro del equipo es un riesgo. */
  private defaultMaxAttempts(kind: EnqueueCommandInput['kind']): number | null {
    return kind === DEVICE_COMMAND_KIND.USER_DELETE ? null : DEVICE_COMMAND_MAX_ATTEMPTS
  }

  async cancel(commandId: number, requestedByUserId: number | null): Promise<DeviceCommand> {
    const command = await this.requireCommand(commandId)
    if (command.deviceCommandStatus !== DEVICE_COMMAND_STATUS.PENDING) {
      throw new DeviceCommandError(
        'Solo se puede cancelar un comando que sigue pendiente',
        DEVICE_COMMAND_ERROR_CODES.STATE_NOT_CANCELLABLE,
        409,
        'comando-no-cancelable',
        'El comando ya salio hacia el equipo; espera su resultado o reintenta si falla.'
      )
    }
    this.transition(command, DEVICE_COMMAND_STATUS.CANCELLED)
    command.deviceCommandCancelledAt = this.now()
    if (requestedByUserId !== null) command.deviceCommandRequestedByUserId = requestedByUserId
    await this.repository.save(command)
    return command
  }

  async retry(commandId: number, requestedByUserId: number | null): Promise<DeviceCommand> {
    const command = await this.requireCommand(commandId)
    if (command.deviceCommandStatus !== DEVICE_COMMAND_STATUS.FAILED) {
      throw new DeviceCommandError(
        'Solo se puede reintentar un comando que fallo',
        DEVICE_COMMAND_ERROR_CODES.STATE_NOT_RETRYABLE,
        409,
        'comando-no-reintentable'
      )
    }
    const max = command.deviceCommandMaxAttempts
    if (max !== null && command.deviceCommandAttempts >= max) {
      throw new DeviceCommandError(
        'El comando agoto sus intentos',
        DEVICE_COMMAND_ERROR_CODES.STATE_NOT_RETRYABLE,
        409,
        'intentos-agotados',
        'Revisa el motivo del ultimo fallo antes de volver a intentarlo.'
      )
    }
    this.transition(command, DEVICE_COMMAND_STATUS.PENDING)
    command.deviceCommandAttempts += 1
    command.deviceCommandSentAt = null
    command.deviceCommandFailedAt = null
    command.deviceCommandLastError = null
    command.deviceCommandReturnCode = null
    if (requestedByUserId !== null) command.deviceCommandRequestedByUserId = requestedByUserId
    await this.repository.save(command)
    return command
  }

  async listByDevice(accessPointId: number, status?: DeviceCommandStatus): Promise<DeviceCommand[]> {
    return this.repository.listByDevice(accessPointId, status)
  }

  async listByEmployee(employeeId: number): Promise<DeviceCommand[]> {
    return this.repository.listByEmployee(employeeId)
  }

  /** Aplica la transicion o lanza. No persiste: el llamador decide cuando guardar. */
  transition(command: DeviceCommand, to: DeviceCommandStatus): void {
    const from = command.deviceCommandStatus
    if (from === to) return
    if (!canTransition(from, to)) {
      throw new DeviceCommandError(
        `Un comando en estado ${from} no puede pasar a ${to}`,
        DEVICE_COMMAND_ERROR_CODES.STATE_INVALID,
        409,
        'transicion-invalida'
      )
    }
    command.deviceCommandStatus = to
  }

  private async requireCommand(commandId: number): Promise<DeviceCommand> {
    const command = await this.repository.findById(commandId)
    if (!command) {
      throw new DeviceCommandError(
        'El comando no existe o no tienes acceso a el',
        DEVICE_COMMAND_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'comando-no-encontrado'
      )
    }
    return command
  }
}
