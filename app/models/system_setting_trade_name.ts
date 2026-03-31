import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import SystemSetting from './system_setting.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemSettingTradeName:
 *       type: object
 *       description: Razón social / referencia visual asociada a un system setting
 *       properties:
 *         systemSettingTradeNameId:
 *           type: integer
 *           description: Identificador del registro
 *         systemSettingId:
 *           type: integer
 *           description: System setting padre
 *         systemSettingTradeName:
 *           type: string
 *           description: Razón social
 *         systemSettingLogo:
 *           type: string
 *           nullable: true
 *           description: URL del logo
 *         systemSettingBanner:
 *           type: string
 *           nullable: true
 *           description: URL del banner
 *         systemSettingSidebarColor:
 *           type: string
 *           description: Color de la barra lateral
 *         systemSettingFavicon:
 *           type: string
 *           nullable: true
 *           description: URL del favicon
 *         systemSettingEmployeeAplicationIcon:
 *           type: string
 *           nullable: true
 *           description: URL del ícono de app empleado (512x512 PNG)
 *         systemSettingCreatedAt:
 *           type: string
 *           format: date-time
 *         systemSettingUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class SystemSettingTradeName extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare systemSettingTradeNameId: number

  @column()
  declare systemSettingId: number

  @column({ columnName: 'system_trade_name' })
  declare systemSettingTradeName: string

  @column({ columnName: 'system_trade_name_logo' })
  declare systemSettingLogo: string | null

  @column({ columnName: 'system_trade_name_banner' })
  declare systemSettingBanner: string | null

  @column({ columnName: 'system_trade_name_sidebar_color' })
  declare systemSettingSidebarColor: string

  @column({ columnName: 'system_trade_name_favicon' })
  declare systemSettingFavicon: string | null

  @column({ columnName: 'system_trade_name_employee_aplication_icon' })
  declare systemSettingEmployeeAplicationIcon: string | null

  @column.dateTime({ columnName: 'system_setting_created_at' })
  declare systemSettingCreatedAt: DateTime

  @column.dateTime({ columnName: 'system_setting_updated_at', autoCreate: true, autoUpdate: true })
  declare systemSettingUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'system_setting_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => SystemSetting, {
    foreignKey: 'systemSettingId',
  })
  declare systemSetting: BelongsTo<typeof SystemSetting>
}
