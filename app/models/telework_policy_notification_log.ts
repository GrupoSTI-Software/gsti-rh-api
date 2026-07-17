import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import TeleworkPolicy from '#models/telework_policy'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import type {
  TeleworkPolicyNotificationChannel,
  TeleworkPolicyNotificationType,
  TeleworkPolicyNotificationStatus,
} from '#constants/telework_policy_notification'

/**
 * Bitácora de envíos de la Política de Teletrabajo (USRH1783547655377).
 * Espejo append-only de `complaint_notification_log.ts`: una fila por
 * intento (difusión automática al publicar o recordatorio masivo), nunca se
 * corrige — un reintento es una fila nueva. Referencia `employeeId` (FK),
 * nunca el correo en claro.
 */
export default class TeleworkPolicyNotificationLog extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_policy_notification_logs'

  @column({ isPrimary: true })
  declare teleworkPolicyNotificationLogId: number

  @column()
  declare teleworkPolicyId: number

  @column()
  declare employeeId: number

  @column()
  declare businessUnitId: number

  /** Quién disparó la difusión/recordatorio (atribución); nullable por FK SET NULL. */
  @column()
  declare triggeredByUserId: number | null

  @column()
  declare teleworkPolicyNotificationLogChannel: TeleworkPolicyNotificationChannel

  @column()
  declare teleworkPolicyNotificationLogType: TeleworkPolicyNotificationType

  @column()
  declare teleworkPolicyNotificationLogStatus: TeleworkPolicyNotificationStatus

  /** Detalle del fallo o motivo del skip ('sin-correo'); NULL en sent. */
  @column()
  declare teleworkPolicyNotificationLogError: string | null

  @column.dateTime({
    autoCreate: true,
    columnName: 'telework_policy_notification_log_created_at',
  })
  declare teleworkPolicyNotificationLogCreatedAt: DateTime

  @belongsTo(() => TeleworkPolicy, { foreignKey: 'teleworkPolicyId' })
  declare policy: BelongsTo<typeof TeleworkPolicy>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, { foreignKey: 'triggeredByUserId' })
  declare triggeredByUser: BelongsTo<typeof User>
}
