import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import DeviceCommand from '#models/device_command'
import { DeviceCommandError } from '#exceptions/device_command_error'
import { DEVICE_COMMAND_ERROR_CODES } from '#constants/device_command_error_codes'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
  type DeviceCommandKind,
  type DeviceCommandStatus,
} from './device_command.constants.js'
import type {
  CommandInsert,
  DeviceCommandRepository,
  EnqueueIdempotentResult,
} from './device_command.repository.js'

/** Verdadero si el choque es contra la UNIQUE del identificador de cable. */
function isDuplicateWireId(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

/** Estados en los que un comando sigue vivo para la idempotencia del encolado. */
const LIVE_STATUSES: readonly DeviceCommandStatus[] = [
  DEVICE_COMMAND_STATUS.PENDING,
  DEVICE_COMMAND_STATUS.SENT,
]

/** Adaptador Lucid de la cola de comandos. */
export default class DeviceCommandRepositoryMysql implements DeviceCommandRepository {
  /**
   * Bloquea la fila del punto de acceso, busca por llave de correlacion e
   * inserta, todo en la MISMA transaccion.
   *
   * No se puede partir en dos: `device_commands` referencia a `access_points`,
   * asi que un insert desde otra conexion se quedaria esperando el candado que
   * tiene esta transaccion hasta agotar el tiempo de espera de la base.
   */
  async enqueueIdempotent(
    input: CommandInsert,
    wireIdCandidates: number[]
  ): Promise<EnqueueIdempotentResult | null> {
    return db.transaction(async (trx) => {
      const device = await trx
        .from('access_points')
        .where('access_point_id', input.accessPointId)
        .forUpdate()
        .first()

      /**
       * La empresa la dice el EQUIPO, no quien encola.
       *
       * `business_unit_id` viaja en la entrada y se escribia tal cual, sin
       * cotejarlo contra la fila que esta transaccion ya tiene bloqueada. Un
       * llamador que pasara otra empresa dejaba el comando --y su template--
       * colgando de una empresa a la que ese checador no pertenece, y el corte
       * por empresa de todas las lecturas posteriores lo daba por bueno.
       */
      const owner = device?.business_unit_id ?? null
      if (owner === null || owner !== input.businessUnitId) {
        throw new DeviceCommandError(
          'El checador no pertenece a esa empresa',
          DEVICE_COMMAND_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
          404,
          'punto-acceso-no-encontrado'
        )
      }

      if (input.correlationKey) {
        const existing = await DeviceCommand.query({ client: trx })
          .where('access_point_id', input.accessPointId)
          .where('device_command_correlation_key', input.correlationKey)
          .whereIn('device_command_status', [...LIVE_STATUSES])
          .orderBy('device_command_id', 'asc')
          .first()
        if (existing) return { command: existing, created: false }
      }

      for (const wireId of wireIdCandidates) {
        const command = new DeviceCommand()
        command.useTransaction(trx)
        this.fill(command, input, wireId)
        try {
          await command.save()
          return { command, created: true }
        } catch (error) {
          if (!isDuplicateWireId(error)) throw error
        }
      }
      return null
    })
  }

  private fill(command: DeviceCommand, input: CommandInsert, wireId: number): void {
    command.deviceCommandWireId = wireId
    command.accessPointId = input.accessPointId
    // Ya cotejado contra la fila del equipo dentro de la transaccion.
    command.businessUnitId = input.businessUnitId
    command.deviceCommandKind = input.kind
    command.deviceCommandPin = input.pin
    command.deviceCommandBioNo = input.bioNo
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

  async listLiveForPivot(accessPointEmployeeId: number): Promise<DeviceCommand[]> {
    return DeviceCommand.query()
      .where('access_point_employee_id', accessPointEmployeeId)
      .whereIn('device_command_status', [...LIVE_STATUSES])
      .orderBy('device_command_id', 'asc')
  }

  async listLiveFingerprintWrites(accessPointId: number): Promise<DeviceCommand[]> {
    return DeviceCommand.query()
      .where('access_point_id', accessPointId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIODATA_WRITE)
      .whereIn('device_command_status', [...LIVE_STATUSES])
      .whereIn(
        'biometric_template_id',
        db
          .from('biometric_templates')
          .select('biometric_template_id')
          .where('biometric_template_bio_type', BIO_TYPE.FINGERPRINT)
      )
      .orderBy('device_command_id', 'asc')
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

  /**
   * Toma el candado de la fila del comando y comprueba el estado DENTRO de la
   * transaccion. Se hace con el modelo y no con un `update` suelto porque el
   * payload va cifrado: el cifrado lo sabe el modelo y no se replica aqui.
   */
  async markSent(input: {
    commandId: number
    payload: string
    sentAt: DateTime
  }): Promise<boolean> {
    return db.transaction(async (trx) => {
      const command = await DeviceCommand.query({ client: trx })
        .where('device_command_id', input.commandId)
        .where('device_command_status', DEVICE_COMMAND_STATUS.PENDING)
        .forUpdate()
        .first()
      if (!command) return false
      command.useTransaction(trx)
      command.deviceCommandPayload = input.payload
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.SENT
      command.deviceCommandSentAt = input.sentAt
      await command.save()
      return true
    })
  }

  async markFailedIfStill(input: {
    commandId: number
    expectedStatus: DeviceCommandStatus
    failedAt: DateTime
    error: string
  }): Promise<boolean> {
    return db.transaction(async (trx) => {
      const command = await DeviceCommand.query({ client: trx })
        .where('device_command_id', input.commandId)
        .where('device_command_status', input.expectedStatus)
        .forUpdate()
        .first()
      if (!command) return false
      command.useTransaction(trx)
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = input.failedAt
      command.deviceCommandLastError = input.error
      await command.save()
      return true
    })
  }

  async findAwaitingEvidence(input: {
    accessPointId: number
    kinds: DeviceCommandKind[]
    pin?: string
    bioNo?: number
  }): Promise<DeviceCommand[]> {
    const query = DeviceCommand.query()
      .where('access_point_id', input.accessPointId)
      .whereIn('device_command_kind', input.kinds)
      .whereIn('device_command_status', [
        DEVICE_COMMAND_STATUS.SENT,
        DEVICE_COMMAND_STATUS.ACKED,
      ])
    if (input.pin !== undefined) query.where('device_command_pin', input.pin)
    if (input.bioNo !== undefined) query.where('device_command_bio_no', input.bioNo)
    return query.orderBy('device_command_id', 'asc')
  }

  async save(command: DeviceCommand): Promise<void> {
    await command.save()
  }
}
