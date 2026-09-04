import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * Motivo de cancelación del SAT (`c_MotivoCancelacion`) — catálogo global
 * (USRH1788288461952).
 *
 * `satCancellationReasonRequiresSubstitute` es el dato que obliga a declarar
 * folio sustituto al cancelar. La regla sale de aquí, no de un literal '01'.
 */
export default class SatCancellationReason extends compose(BaseModel, SoftDeletes) {
  static table = 'sat_cancellation_reasons'

  @column({ isPrimary: true })
  declare satCancellationReasonId: number

  @column()
  declare satCancellationReasonCode: string

  @column()
  declare satCancellationReasonDescription: string

  @column()
  declare satCancellationReasonRequiresSubstitute: number

  @column()
  declare satCancellationReasonActive: number

  @column.dateTime({ autoCreate: true })
  declare satCancellationReasonCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare satCancellationReasonUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'sat_cancellation_reason_deleted_at' })
  declare deletedAt: DateTime | null
}
