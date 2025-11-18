import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { hasMany } from '@adonisjs/lucid/orm'
import Supply from './supplie.js'
import * as relations from '@adonisjs/lucid/types/relations'
import SupplieCaracteristic from './supplie_caracteristic.js'
import SupplieCaracteristicValue from './supplie_caracteristic_value.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     SupplyType:
 *       type: object
 *       properties:
 *         supplyTypeId:
 *           type: number
 *           description: Supply type ID
 *         supplyTypeName:
 *           type: string
 *           description: Supply type name
 *         supplyTypeDescription:
 *           type: string
 *           description: Supply type description
 *         supplyTypeSlug:
 *           type: string
 *           description: Supply type slug
 *         supplyTypeCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supply type was created
 *         supplyTypeUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supply type was last updated
 *         supplyTypeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the supply type was soft-deleted
 *       example:
 *         supplyTypeId: 1
 *         supplyTypeName: 'Supply Type Name'
 *         supplyTypeDescription: 'Supply Type Description'
 *         supplyTypeSlug: 'supply-type-slug'
 *         supplyTypeCreatedAt: '2025-02-12T12:00:00Z'
 *         supplyTypeUpdatedAt: '2025-02-12T13:00:00Z'
 *         supplyTypeDeletedAt: null
 */

export default class SupplyType extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare supplyTypeId: number

  @column()
  declare supplyTypeName: string

  @column()
  declare supplyTypeDescription: string | null

  @column()
  declare supplyTypeIdentifier: string | null

  @column()
  declare supplyTypeSlug: string

  @column.dateTime({ autoCreate: true, columnName: 'supply_type_created_at' })
  declare supplyTypeCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'supply_type_updated_at' })
  declare supplyTypeUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'supply_type_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => Supply)
  declare supplies: relations.HasMany<typeof Supply>

  @hasMany(() => SupplieCaracteristic)
  declare supplieCaracteristics: relations.HasMany<typeof SupplieCaracteristic>

  @hasMany(() => SupplieCaracteristicValue)
  declare supplieCaracteristicValues: relations.HasMany<typeof SupplieCaracteristicValue>
}
