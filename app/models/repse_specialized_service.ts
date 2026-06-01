import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import RepseRegistration from '#models/repse_registration'

/**
 * Estados permitidos para un servicio especializado REPSE.
 *
 * Inicialmente sólo se admite `active`; estados adicionales (suspended,
 * cancelled, etc.) se incorporarán en historias posteriores junto con sus
 * reglas de transición.
 */
export type RepseSpecializedServiceStatus = 'active'

/**
 * @swagger
 * components:
 *   schemas:
 *     RepseSpecializedService:
 *       type: object
 *       properties:
 *         repseSpecializedServiceId:
 *           type: integer
 *           description: Identificador único del servicio especializado.
 *         repseRegistrationId:
 *           type: integer
 *           description: Registro REPSE padre que ampara este servicio.
 *         name:
 *           type: string
 *           maxLength: 150
 *           description: Nombre del servicio o actividad especializada.
 *         objectDescription:
 *           type: string
 *           description: Descripción del objeto o alcance del servicio.
 *         status:
 *           type: string
 *           enum: [active]
 *           description: Estado del servicio.
 *         repseSpecializedServiceCreatedAt:
 *           type: string
 *           format: date-time
 *         repseSpecializedServiceUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         repseSpecializedServiceDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class RepseSpecializedService extends compose(BaseModel, SoftDeletes) {
  static table = 'repse_specialized_services'

  @column({ isPrimary: true })
  declare repseSpecializedServiceId: number

  @column()
  declare repseRegistrationId: number

  @column({ columnName: 'repse_specialized_service_name' })
  declare name: string

  @column({ columnName: 'repse_specialized_service_object_description' })
  declare objectDescription: string

  @column({ columnName: 'repse_specialized_service_status' })
  declare status: RepseSpecializedServiceStatus

  @column.dateTime({ autoCreate: true, columnName: 'repse_specialized_service_created_at' })
  declare repseSpecializedServiceCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'repse_specialized_service_updated_at',
  })
  declare repseSpecializedServiceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'repse_specialized_service_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => RepseRegistration, {
    foreignKey: 'repseRegistrationId',
    localKey: 'repseRegistrationId',
  })
  declare repseRegistration: BelongsTo<typeof RepseRegistration>
}
