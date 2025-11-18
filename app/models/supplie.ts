import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { belongsTo } from '@adonisjs/lucid/orm'
import SupplyType from './supply_type.js'
import * as relations from '@adonisjs/lucid/types/relations'
import SupplieCaracteristic from './supplie_caracteristic.js'
import SupplieCaracteristicValue from './supplie_caracteristic_value.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     Supplie:
 *       type: object
 *       properties:
 *         supplyId:
 *           type: number
 *           description: Supply ID
 *         supplyFileNumber:
 *           type: number
 *           description: Supply file number
 *         supplyName:
 *           type: string
 *           description: Supply name
 *         supplyDescription:
 *           type: string
 *           description: Supply description
 *         supplyTypeId:
 *           type: number
 *           description: Supply type ID
 *         supplyStatus:
 *           type: string
 *           description: Supply status
 *         supplyDeactivationReason:
 *           type: string
 *           description: Supply deactivation reason and reason description
 *           example:
 *             reason: 'Lost'
 *             reasonDescription: 'The supply was lost and not found'
 *             reason: 'Damaged'
 *             reasonDescription: 'The supply was damaged and not usable or repairable'
 *             reason: 'Stolen'
 *             reasonDescription: 'The supply was stolen and not found'
 *             reason: 'Damaged'
 *             reasonDescription: 'The supply is no not longer usable or repairable or maybe its destroyed like in a fire, flood or car accident'
 *         supplyDeactivationDate:
 *           type: string
 *           format: date-time
 *           description: Supply deactivation date
 *         supplyCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supply was created
 *         supplyUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supply was last updated
 *         supplyDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the supply was soft-deleted
 *       example:
 *         supplyId: 1
 *         supplyFileNumber: 123456
 *         supplyName: 'Supply Name'
 *         supplyDescription: 'Supply Description'
 *         supplyTypeId: 1
 *         supplyStatus: 'active'
 *         supplyDeactivationReason: 'Supply Deactivation Reason'
 *         supplyDeactivationDate: '2025-02-12T12:00:00Z'
 *         supplyCreatedAt: '2025-02-12T12:00:00Z'
 *         supplyUpdatedAt: '2025-02-12T13:00:00Z'
 *         supplyDeletedAt: null
 */

export default class Supplie extends compose(BaseModel, SoftDeletes) {

  @column({ isPrimary: true })
  declare supplyId: number

  @column()
  declare supplyFileNumber: number

  @column()
  declare supplyName: string

  @column()
  declare supplyDescription: string | null

  @column()
  declare supplyTypeId: number

  @column()
  declare supplyStatus: 'active' | 'inactive' | 'lost' | 'damaged'

  @column()
  declare supplyDeactivationReason: string | null

  @column.dateTime()
  declare supplyDeactivationDate: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare supplyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare supplyUpdatedAt: DateTime

  static softDeleteColumn = 'supply_deleted_at'

  @column.dateTime({ columnName: 'supply_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => SupplyType, {
    foreignKey: 'supplyTypeId',
    onQuery: (query) => {
      query.whereNull('supply_type_deleted_at')
    },
  })
  declare supplyType: relations.BelongsTo<typeof SupplyType>

  @hasMany(() => SupplieCaracteristic)
  declare supplieCaracteristics: relations.HasMany<typeof SupplieCaracteristic>

  @hasMany(() => SupplieCaracteristicValue)
  declare supplieCaracteristicValues: relations.HasMany<typeof SupplieCaracteristicValue>
}
