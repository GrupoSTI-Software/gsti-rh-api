import { DateTime } from 'luxon'
import { BaseModel, column, hasOne } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasOne } from '@adonisjs/lucid/types/relations'
import AllianceBillingProfile from '#models/alliance_billing_profile'
import DiscountCode from '#models/discount_code'

/**
 * Alianza comercial de GSTI (USRH1788505941892).
 *
 * Registro de plataforma, sin dueño de tenant: no compone
 * `withBusinessUnitScope` ni `withSensitiveWriteGuard`. El aislamiento
 * lo da el guard `platformAdmin` de la ruta.
 *
 * @swagger
 * components:
 *   schemas:
 *     Alliance:
 *       type: object
 *       properties:
 *         allianceId:
 *           type: integer
 *         allianceName:
 *           type: string
 *         allianceContactName:
 *           type: string
 *           nullable: true
 *         allianceContactEmail:
 *           type: string
 *           nullable: true
 *         allianceContactPhone:
 *           type: string
 *           nullable: true
 *         allianceDefaultCommissionPercent:
 *           type: number
 *         allianceDefaultTermPeriods:
 *           type: integer
 *           nullable: true
 *           description: NULL = plazo indeterminado
 *         allianceActive:
 *           type: integer
 *           enum: [0, 1]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class Alliance extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'alliances'

  @column({ isPrimary: true })
  declare allianceId: number

  @column()
  declare allianceName: string

  @column()
  declare allianceContactName: string | null

  @column()
  declare allianceContactEmail: string | null

  @column()
  declare allianceContactPhone: string | null

  @column({ consume: (value: number | string) => Number(value) })
  declare allianceDefaultCommissionPercent: number

  @column({
    consume: (value: number | string | null) => (value === null ? null : Number(value)),
  })
  declare allianceDefaultTermPeriods: number | null

  @column({ consume: (value: number | string) => (Number(value) === 1 ? 1 : 0) })
  declare allianceActive: 0 | 1

  /**
   * Key S3 del PNG del QR. NULL = aún no subido.
   * `serializeAs: null`: la key incluye el texto del código en el nombre.
   */
  @column({ columnName: 'alliance_qr_storage_key', serializeAs: null })
  declare allianceQrStorageKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'alliance_deleted_at' })
  declare deletedAt: DateTime | null

  @hasOne(() => AllianceBillingProfile, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare allianceBillingProfile: HasOne<typeof AllianceBillingProfile>

  @hasOne(() => DiscountCode, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare discountCode: HasOne<typeof DiscountCode>
}
