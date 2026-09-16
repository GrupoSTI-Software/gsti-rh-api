import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/** Que paso en el pivote. `pin_change` guarda el PIN anterior y el nuevo. */
export const ACCESS_POINT_EMPLOYEE_EVENT_KIND = {
  PIN_ASSIGNED: 'pin_assigned',
  PIN_INFERRED: 'pin_inferred',
  PIN_CHANGE: 'pin_change',
  REASSIGNED: 'reassigned',
  SEND_REQUESTED: 'send_requested',
  REVOKE_REQUESTED: 'revoke_requested',
  STATUS_CHANGED: 'status_changed',
} as const

export type AccessPointEmployeeEventKind =
  (typeof ACCESS_POINT_EMPLOYEE_EVENT_KIND)[keyof typeof ACCESS_POINT_EMPLOYEE_EVENT_KIND]

/**
 * Historial del pivote (spec ADMS 8.1). Cuando una checada acaba en la persona
 * equivocada, esta tabla dice cuando se reciclo ese PIN y quien lo hizo.
 */
export default class AccessPointEmployeeEvent extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static readonly table = 'access_point_employee_events'

  @column({ isPrimary: true })
  declare accessPointEmployeeEventId: number

  @column()
  declare accessPointEmployeeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare accessPointEmployeeEventKind: AccessPointEmployeeEventKind

  @column()
  declare accessPointEmployeeEventFromStatus: string | null

  @column()
  declare accessPointEmployeeEventToStatus: string | null

  @column()
  declare accessPointEmployeeEventFromPin: string | null

  @column()
  declare accessPointEmployeeEventToPin: string | null

  @column()
  declare accessPointEmployeeEventActorUserId: number | null

  @column()
  declare deviceCommandId: number | null

  @column()
  declare accessPointEmployeeEventDetail: string | null

  @column.dateTime({ autoCreate: true })
  declare accessPointEmployeeEventCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointEmployeeEventUpdatedAt: DateTime
}
