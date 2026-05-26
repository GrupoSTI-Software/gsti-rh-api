import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'

/**
 * Estados permitidos para un registro REPSE.
 *
 * Inicialmente solo se admite `active`. Estados como `expired` o `cancelled`
 * se incorporarán en historias posteriores con sus reglas de transición.
 */
export type RepseRegistrationStatus = 'active'

/**
 * @swagger
 * components:
 *   schemas:
 *     RepseRegistration:
 *       type: object
 *       properties:
 *         repseRegistrationId:
 *           type: integer
 *           description: Identificador único del registro REPSE.
 *         businessUnitId:
 *           type: integer
 *           description: Empresa propietaria del registro (FK a business_units).
 *         folio:
 *           type: string
 *           maxLength: 50
 *           description: Folio asignado por la STPS al registro REPSE.
 *         registeredAt:
 *           type: string
 *           format: date
 *           description: Fecha de alta del registro ante la STPS (YYYY-MM-DD).
 *         expiresAt:
 *           type: string
 *           format: date
 *           description: Fecha de vencimiento del registro (YYYY-MM-DD).
 *         status:
 *           type: string
 *           enum: [active]
 *           description: Estado del registro.
 *         repseRegistrationCreatedAt:
 *           type: string
 *           format: date-time
 *         repseRegistrationUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         repseRegistrationDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class RepseRegistration extends compose(BaseModel, SoftDeletes) {
  static table = 'repse_registrations'

  @column({ isPrimary: true })
  declare repseRegistrationId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'repse_registration_folio' })
  declare folio: string

  @column.date({ columnName: 'repse_registration_registered_at' })
  declare registeredAt: DateTime

  @column.date({ columnName: 'repse_registration_expires_at' })
  declare expiresAt: DateTime

  @column({ columnName: 'repse_registration_status' })
  declare status: RepseRegistrationStatus

  @column.dateTime({ autoCreate: true })
  declare repseRegistrationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare repseRegistrationUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'repse_registration_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
