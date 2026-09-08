import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import encryption from '@adonisjs/core/services/encryption'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type {
  DeviceCommandKind,
  DeviceCommandStatus,
} from '#modules/device-commands/device_command.constants'

/** Contadores del equipo al momento del acuse, para comparar la evidencia despues. */
export interface DeviceCommandCountersSnapshot {
  userCount?: number | null
  fpCount?: number | null
  faceCount?: number | null
}

/**
 * Orden pendiente o resuelta hacia un checador (spec v2, 6).
 *
 * `deviceCommandPayload` es la linea literal que se le manda al equipo y puede
 * llevar un template biometrico: va cifrada en reposo y NUNCA se serializa.
 */
export default class DeviceCommand extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'device_commands'

  @column({ isPrimary: true })
  declare deviceCommandId: number

  /** Identificador que viaja al equipo y regresa en el acuse. */
  @column()
  declare deviceCommandWireId: number

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number | null

  @column()
  declare accessPointEmployeeId: number | null

  @column()
  declare deviceCommandKind: DeviceCommandKind

  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serializeAs: null,
  })
  declare deviceCommandPayload: string | null

  @column()
  declare deviceCommandStatus: DeviceCommandStatus

  @column()
  declare deviceCommandPriority: number

  @column()
  declare deviceCommandAttempts: number

  @column()
  declare deviceCommandMaxAttempts: number | null

  @column()
  declare deviceCommandReturnCode: number | null

  @column()
  declare deviceCommandReturnRaw: string | null

  @column.dateTime()
  declare deviceCommandSentAt: DateTime | null

  @column.dateTime()
  declare deviceCommandAckedAt: DateTime | null

  @column.dateTime()
  declare deviceCommandExecutedAt: DateTime | null

  @column.dateTime()
  declare deviceCommandFailedAt: DateTime | null

  @column.dateTime()
  declare deviceCommandCancelledAt: DateTime | null

  @column.dateTime()
  declare deviceCommandExpiresAt: DateTime | null

  @column()
  declare deviceCommandLastError: string | null

  @column()
  declare deviceCommandExecutionEvidence: string | null

  @column({
    prepare: (value: DeviceCommandCountersSnapshot | null) =>
      value ? JSON.stringify(value) : null,
    consume: (value: string | DeviceCommandCountersSnapshot | null) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return JSON.parse(value) as DeviceCommandCountersSnapshot
      return value
    },
  })
  declare deviceCommandCountersSnapshot: DeviceCommandCountersSnapshot | null

  @column()
  declare deviceCommandCorrelationKey: string | null

  @column()
  declare deviceCommandRequestedByUserId: number | null

  @column()
  declare biometricTemplateId: number | null

  @column()
  declare biometricPhotoPublicationId: number | null

  @column.dateTime({ autoCreate: true })
  declare deviceCommandCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare deviceCommandUpdatedAt: DateTime
}
