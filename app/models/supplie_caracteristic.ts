import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { belongsTo } from '@adonisjs/lucid/orm'
import SupplyType from './supply_type.js'
import * as relations from '@adonisjs/lucid/types/relations'
import SupplieCaracteristicValue from './supplie_caracteristic_value.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     SupplieCaracteristic:
 *       type: object
 *       properties:
 *         supplieCaracteristicId:
 *           type: number
 *           description: Supplie caracteristic ID
 *         supplyTypeId:
 *           type: number
 *           description: Supply type ID
 *         supplieCaracteristicName:
 *           type: string
 *           description: Supplie caracteristic name
 *         supplieCaracteristicType:
 *           type: string
 *           description: Supplie caracteristic type
 *         supplieCaracteristicCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supplie caracteristic was created
 *         supplieCaracteristicUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supplie caracteristic was last updated
 *         supplieCaracteristicDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the supplie caracteristic was soft-deleted
 *       example:
 *         supplieCaracteristicId: 1
 *         supplyTypeId: 1
 *         supplieCaracteristicName: 'Color'
 *         supplieCaracteristicType: 'text'
 *         supplieCaracteristicCreatedAt: '2025-02-12T12:00:00Z'
 *         supplieCaracteristicUpdatedAt: '2025-02-12T13:00:00Z'
 *         supplieCaracteristicDeletedAt: null
 */

export default class SupplieCaracteristic extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare supplieCaracteristicId: number

  @column()
  declare supplyTypeId: number

  @column()
  declare supplieCaracteristicName: string

  @column()
  declare supplieCaracteristicType: 'text' | 'number' | 'date' | 'boolean' | 'radio' | 'file'

  @column.dateTime({ autoCreate: true })
  declare supplieCaracteristicCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare supplieCaracteristicUpdatedAt: DateTime

  @column.dateTime({ columnName: 'supplie_caracteristic_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => SupplieCaracteristicValue)
  declare supplieCaracteristicValues: relations.HasMany<typeof SupplieCaracteristicValue>

  @belongsTo(() => SupplyType, {
    foreignKey: 'supplyTypeId',
    onQuery: (query) => {
      query.whereNull('supply_type_deleted_at')
    },
  })
  declare supplyType: relations.BelongsTo<typeof SupplyType>
}
