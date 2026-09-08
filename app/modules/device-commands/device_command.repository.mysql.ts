import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandKind,
  type DeviceCommandStatus,
} from './device_command.constants.js'
import type { CommandInsert, DeviceCommandRepository } from './device_command.repository.js'

/** Estados en los que un comando sigue vivo para la idempotencia del encolado. */
const LIVE_STATUSES: readonly DeviceCommandStatus[] = [
  DEVICE_COMMAND_STATUS.PENDING,
  DEVICE_COMMAND_STATUS.SENT,
]

/** Adaptador Lucid de la cola de comandos. */
export default class DeviceCommandRepositoryMysql implements DeviceCommandRepository {
  /**
   * Bloquea la fila del punto de acceso mientras dura la operacion. Es la
   * convencion del repo para serializar por dispositivo sin inventar una
   * UNIQUE parcial que MySQL 8 no soporta.
   */
  async withDeviceLock<T>(accessPointId: number, fn: () => Promise<T>): Promise<T> {
    return db.transaction(async (trx) => {
      await trx.from('access_points').where('access_point_id', accessPointId).forUpdate().first()
      return fn()
    })
  }

  async findLiveByCorrelation(
    accessPointId: number,
    correlationKey: string
  ): Promise<DeviceCommand | null> {
    return DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_correlation_key', correlationKey)
      .whereIn('device_command_status', [...LIVE_STATUSES])
      .orderBy('device_command_id', 'asc')
      .first()
  }

  async insert(input: CommandInsert): Promise<DeviceCommand> {
    const command = new DeviceCommand()
    command.deviceCommandWireId = input.wireId
    command.accessPointId = input.accessPointId
    command.businessUnitId = input.businessUnitId
    command.deviceCommandKind = input.kind
    command.deviceCommandPayload = input.payload
    command.deviceCommandStatus = DEVICE_COMMAND_STATUS.PENDING
    command.deviceCommandPriority = input.priority
    command.deviceCommandAttempts = 0
    command.deviceCommandMaxAttempts = input.maxAttempts
    command.employeeId = input.employeeId
    command.accessPointEmployeeId = input.accessPointEmployeeId
    command.deviceCommandCorrelationKey = input.correlationKey
    command.deviceCommandRequestedByUserId = input.requestedByUserId
    command.biometricTemplateId = input.biometricTemplateId
    command.biometricPhotoPublicationId = input.biometricPhotoPublicationId
    await command.save()
    return command
  }

  async findById(commandId: number): Promise<DeviceCommand | null> {
    return DeviceCommand.query().where('device_command_id', commandId).first()
  }

  async findByWireId(wireId: number): Promise<DeviceCommand | null> {
    return DeviceCommand.query().where('device_command_wire_id', wireId).first()
  }

  async findNextPending(
    accessPointId: number,
    excludedKinds: DeviceCommandKind[]
  ): Promise<DeviceCommand | null> {
    const query = DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_status', DEVICE_COMMAND_STATUS.PENDING)
    if (excludedKinds.length > 0) query.whereNotIn('device_command_kind', excludedKinds)
    return query
      .orderBy('device_command_priority', 'asc')
      .orderBy('device_command_id', 'asc')
      .first()
  }

  async hasInFlight(accessPointId: number): Promise<boolean> {
    const row = await DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_status', DEVICE_COMMAND_STATUS.SENT)
      .first()
    return row !== null
  }

  async listByDevice(
    accessPointId: number,
    status?: DeviceCommandStatus
  ): Promise<DeviceCommand[]> {
    const query = DeviceCommand.query().where('access_point_id', accessPointId)
    if (status) query.where('device_command_status', status)
    return query.orderBy('device_command_id', 'desc').limit(200)
  }

  async listByEmployee(employeeId: number): Promise<DeviceCommand[]> {
    return DeviceCommand.query()
      .where('employee_id', employeeId)
      .orderBy('device_command_id', 'desc')
      .limit(200)
  }

  /**
   * Se lee sin corte por empresa: el barrido corre por proceso, no por
   * peticion, y su trabajo es cerrar lo colgado de TODOS los equipos. Cada
   * comando trae su empresa para lo que venga despues.
   */
  async findStuck(input: {
    sentBefore: DateTime
    enrollSentBefore: DateTime
    ackedBefore: DateTime
    limit: number
  }): Promise<DeviceCommand[]> {
    const format = (value: DateTime) => value.toFormat('yyyy-MM-dd HH:mm:ss')
    return DeviceCommand.query()
      .where((group) => {
        group
          .where('device_command_status', DEVICE_COMMAND_STATUS.SENT)
          .whereNot('device_command_kind', DEVICE_COMMAND_KIND.ENROLL_FP)
          .where('device_command_sent_at', '<', format(input.sentBefore))
      })
      .orWhere((group) => {
        group
          .where('device_command_status', DEVICE_COMMAND_STATUS.SENT)
          .where('device_command_kind', DEVICE_COMMAND_KIND.ENROLL_FP)
          .where('device_command_sent_at', '<', format(input.enrollSentBefore))
      })
      .orWhere((group) => {
        group
          .where('device_command_status', DEVICE_COMMAND_STATUS.ACKED)
          .where('device_command_acked_at', '<', format(input.ackedBefore))
      })
      .orderBy('device_command_id', 'asc')
      .limit(input.limit)
  }

  async save(command: DeviceCommand): Promise<void> {
    await command.save()
  }
}
