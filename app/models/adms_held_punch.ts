import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/** Por que no se pudo atribuir la checada (spec v2, 9.4). */
export const ADMS_HELD_PUNCH_REASON = {
  UNKNOWN_PIN: 'unknown_pin',
  EMPLOYEE_TERMINATED: 'employee_terminated',
  AMBIGUOUS_CODE: 'ambiguous_code',
  PIN_QUARANTINED: 'pin_quarantined',
  INGESTION_REJECTED: 'ingestion_rejected',
} as const

export type AdmsHeldPunchReason =
  (typeof ADMS_HELD_PUNCH_REASON)[keyof typeof ADMS_HELD_PUNCH_REASON]

export type AdmsHeldPunchStatus = 'held' | 'attributed' | 'discarded'

/**
 * Checada que llego bien pero no se pudo atribuir. No se pierde ni se rechaza:
 * espera aqui a que alguien concilie el PIN o reactive al colaborador.
 */
export default class AdmsHeldPunch extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'adms_held_punches'

  @column({ isPrimary: true })
  declare admsHeldPunchId: number

  @column()
  declare admsUnmappedPinId: number | null

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare admsHeldPunchPin: string

  @column.dateTime()
  declare admsHeldPunchPunchTimeLocal: DateTime

  @column.dateTime()
  declare admsHeldPunchPunchTimeUtc: DateTime

  @column()
  declare admsHeldPunchVerify: number | null

  @column()
  declare admsRawMessageId: number | null

  @column()
  declare admsHeldPunchReason: AdmsHeldPunchReason

  @column()
  declare admsHeldPunchStatus: AdmsHeldPunchStatus

  @column()
  declare assistId: number | null

  @column.dateTime()
  declare admsHeldPunchAttributedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare admsHeldPunchCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare admsHeldPunchUpdatedAt: DateTime
}
