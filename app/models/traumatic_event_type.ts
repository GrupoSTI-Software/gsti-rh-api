import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *      TraumaticEventType:
 *        type: object
 *        properties:
 *          traumaticEventTypeId:
 *            type: number
 *            description: Traumatic event type ID
 *          traumaticEventTypeName:
 *            type: string
 *            description: Traumatic event type name
 *          traumaticEventTypeDescription:
 *            type: string
 *            description: Traumatic event type description
 *          traumaticEventTypeSlug:
 *            type: string
 *            description: Traumatic event type SLUG
 *          traumaticEventTypeActive:
 *            type: number
 *            description: Traumatic event type status
 *          traumaticEventTypeCreatedAt:
 *            type: string
 *            format: date-time
 *          traumaticEventTypeUpdatedAt:
 *            type: string
 *            format: date-time
 *          traumaticEventTypeDeletedAt:
 *            type: string
 *            format: date-time
 *            nullable: true
 */
export default class TraumaticEventType extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare traumaticEventTypeId: number

  @column()
  declare traumaticEventTypeName: string

  @column()
  declare traumaticEventTypeDescription: string

  @column()
  declare traumaticEventTypeSlug: string

  @column()
  declare traumaticEventTypeActive: number

  @column.dateTime({ autoCreate: true })
  declare traumaticEventTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare traumaticEventTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'traumatic_event_type_deleted_at' })
  declare deletedAt: DateTime | null
}
