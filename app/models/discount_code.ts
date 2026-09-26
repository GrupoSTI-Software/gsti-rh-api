import { DateTime } from 'luxon'
import { BaseModel, beforeSave, beforeUpdate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import Alliance from '#models/alliance'

export type DiscountCodeKind = 'percent' | 'fixed_amount' | 'unit_price'

/**
 * @swagger
 * components:
 *   schemas:
 *     DiscountCode:
 *       type: object
 *       properties:
 *         discountCodeId:
 *           type: integer
 *         discountCodeCode:
 *           type: string
 *           description: Texto entregado al cliente, siempre en MAYÚSCULAS; irrepetible de por vida.
 *         discountCodeName:
 *           type: string
 *         discountCodeKind:
 *           type: string
 *           enum: [percent, fixed_amount, unit_price]
 *         discountCodeValue:
 *           type: number
 *         discountCodeValidFrom:
 *           type: string
 *           format: date
 *           nullable: true
 *         discountCodeValidTo:
 *           type: string
 *           format: date
 *           nullable: true
 *         discountCodeMaxRedemptions:
 *           type: integer
 *           nullable: true
 *         discountCodeRedeemedCount:
 *           type: integer
 *         discountCodeBenefitPeriods:
 *           type: integer
 *           nullable: true
 *         discountCodeActive:
 *           type: integer
 *           enum: [0, 1]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
export default class DiscountCode extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'discount_codes'

  @column({ isPrimary: true })
  declare discountCodeId: number

  /** Texto entregado al cliente. MAYÚSCULAS, irrepetible de por vida, inmutable tras crearse. */
  @column()
  declare discountCodeCode: string

  @column()
  declare discountCodeName: string

  @column()
  declare discountCodeKind: DiscountCodeKind

  @column()
  declare discountCodeValue: number

  @column()
  declare discountCodeValidFrom: string | null

  @column()
  declare discountCodeValidTo: string | null

  @column()
  declare discountCodeMaxRedemptions: number | null

  /** Denormalizado; solo lo mueve el canje (USRH1787714804401). Nunca capturable por API. */
  @column()
  declare discountCodeRedeemedCount: number

  @column()
  declare discountCodeBenefitPeriods: number | null

  @column()
  declare discountCodeActive: number

  /**
   * Dueño opcional. NULL = código del catálogo general.
   * `serializeAs: null` para no cambiar la forma de las respuestas
   * del catálogo (regla 12).
   */
  @column({ columnName: 'discount_code_alliance_id', serializeAs: null })
  declare allianceId: number | null

  @belongsTo(() => Alliance, {
    foreignKey: 'allianceId',
    localKey: 'allianceId',
  })
  declare alliance: BelongsTo<typeof Alliance>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'discount_code_deleted_at' })
  declare deletedAt: DateTime | null

  /** Normaliza el texto a MAYÚSCULAS antes de persistir (regla 1). */
  @beforeSave()
  static normalizeCode(discountCode: DiscountCode) {
    if (discountCode.discountCodeCode) {
      discountCode.discountCodeCode = discountCode.discountCodeCode.trim().toUpperCase()
    }
  }

  /**
   * Guarda write-once del texto (regla 4): si `discountCodeCode` viene sucio
   * en una actualización, se rechaza con 409 antes de tocar la BD.
   */
  @beforeUpdate()
  static rejectCodeMutation(discountCode: DiscountCode) {
    if (discountCode.$dirty.discountCodeCode !== undefined) {
      throw new DiscountCodeServiceError(
        'El texto de un código de descuento es inmutable.',
        DISCOUNT_CODE_ERROR_CODES.CODE_IMMUTABLE,
        409,
        'codigo-inmutable',
        'El texto de un código de descuento es inmutable. Crea uno nuevo si necesitas otro texto.'
      )
    }
  }
}
