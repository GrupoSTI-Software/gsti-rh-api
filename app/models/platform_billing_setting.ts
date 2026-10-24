import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class PlatformBillingSetting extends BaseModel {
  static table = 'platform_billing_settings'

  @column({ isPrimary: true })
  declare platformBillingSettingId: number

  @column()
  declare platformBillingSettingGraceDays: number

  @column({ consume: (value: unknown) => Boolean(value) })
  declare platformBillingSettingRestrictionEnabled: boolean

  @column.date({ serialize: (value: DateTime | null) => value?.toISODate() ?? null })
  declare platformBillingSettingRestrictionEnabledOn: DateTime | null

  @column()
  declare platformBillingSettingCreatedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare platformBillingSettingCreatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'platformBillingSettingCreatedByUserId' })
  declare createdBy: BelongsTo<typeof User>
}