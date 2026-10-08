import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import TraumaticEventReport from '#models/traumatic_event_report'
import User from '#models/user'
import BusinessUnit from '#models/business_unit'
import type {
  TraumaticEventReportNotificationChannel,
  TraumaticEventReportNotificationStatus,
} from '#constants/traumatic_event_report_notification'

/**
 * Constancia de un intento de avisar a una persona un reporte de origen
 * empleado. Solo se agrega: no se edita ni se da de baja desde el sistema.
 */
export default class TraumaticEventReportNotificationLog extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'traumatic_event_report_notification_logs'

  @column({ isPrimary: true })
  declare traumaticEventReportNotificationLogId: number

  @column()
  declare traumaticEventReportId: number

  @column()
  declare businessUnitId: number

  @column()
  declare recipientUserId: number

  @column()
  declare traumaticEventReportNotificationLogChannel: TraumaticEventReportNotificationChannel

  @column()
  declare traumaticEventReportNotificationLogStatus: TraumaticEventReportNotificationStatus

  @column.dateTime({
    autoCreate: true,
    columnName: 'traumatic_event_report_notification_log_created_at',
  })
  declare traumaticEventReportNotificationLogCreatedAt: DateTime

  /** Resuelve businessUnitId desde el reporte padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: TraumaticEventReportNotificationLog) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        TraumaticEventReport.query()
          .where('traumaticEventReportId', instance.traumaticEventReportId)
          .first(),
      'el reporte de evento traumático'
    )
  }

  @belongsTo(() => TraumaticEventReport, { foreignKey: 'traumaticEventReportId' })
  declare traumaticEventReport: BelongsTo<typeof TraumaticEventReport>

  @belongsTo(() => User, { foreignKey: 'recipientUserId' })
  declare recipient: BelongsTo<typeof User>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
