import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * `processing` es el reclamo: lo pone la corrida que se hizo cargo del trabajo,
 * para que otra que arranque en paralelo no vuelva a tomarlo.
 */
export type AssistCalendarRecalcJobStatus = 'pending' | 'processing' | 'done' | 'failed'

/**
 * Recalculo de calendario pendiente para un colaborador (spec v2, 5.4). El
 * checador espera un acuse en segundos; el recalculo sale de la peticion y lo
 * consume `adms:recalc-calendars`.
 */
export default class AssistCalendarRecalcJob extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'assist_calendar_recalc_jobs'

  @column({ isPrimary: true })
  declare assistCalendarRecalcJobId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number

  @column.date()
  declare assistCalendarRecalcJobFrom: DateTime

  @column.date()
  declare assistCalendarRecalcJobTo: DateTime

  @column()
  declare assistCalendarRecalcJobStatus: AssistCalendarRecalcJobStatus

  @column()
  /** Identificador de la corrida que reclamo el trabajo. */
  @column()
  declare assistCalendarRecalcJobClaimedBy: string | null

  @column.dateTime()
  declare assistCalendarRecalcJobClaimedAt: DateTime | null

  @column()
  declare assistCalendarRecalcJobAttempts: number

  @column()
  declare assistCalendarRecalcJobError: string | null

  @column.dateTime()
  declare assistCalendarRecalcJobDoneAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare assistCalendarRecalcJobCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare assistCalendarRecalcJobUpdatedAt: DateTime
}
