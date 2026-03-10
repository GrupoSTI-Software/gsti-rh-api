import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Supplie from './supplie.js'
import * as relations from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     SupplyValueHistory:
 *       type: object
 *       properties:
 *         supplyValueHistoryId:
 *           type: number
 *           description: Supply value history ID
 *         supplyId:
 *           type: number
 *           description: Supply ID
 *         supplyValueHistoryCost:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           description: Costo del insumo (no permite valores negativos)
 *         supplyValueHistoryCurrentValue:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           description: Valor actual del insumo (no permite valores negativos)
 *         supplyValueHistoryNotes:
 *           type: string
 *           nullable: true
 *           description: Notas adicionales sobre el cambio de valor
 *         supplyValueHistoryCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de creación del registro
 *         supplyValueHistoryUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora de última actualización
 *         supplyValueHistoryDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Fecha y hora de eliminación suave
 *       example:
 *         supplyValueHistoryId: 1
 *         supplyId: 1
 *         supplyValueHistoryCost: 1500.00
 *         supplyValueHistoryCurrentValue: 1200.00
 *         supplyValueHistoryNotes: 'Depreciación anual'
 *         supplyValueHistoryCreatedAt: '2026-03-10T12:00:00Z'
 *         supplyValueHistoryUpdatedAt: '2026-03-10T12:00:00Z'
 *         supplyValueHistoryDeletedAt: null
 */
export default class SupplyValueHistory extends compose(BaseModel, SoftDeletes) {
  static table = 'supply_value_histories'

  @column({ isPrimary: true })
  declare supplyValueHistoryId: number

  @column()
  declare supplyId: number

  @column()
  declare supplyValueHistoryCost: number

  @column()
  declare supplyValueHistoryCurrentValue: number

  @column()
  declare supplyValueHistoryNotes: string | null

  @column.dateTime({ autoCreate: true })
  declare supplyValueHistoryCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare supplyValueHistoryUpdatedAt: DateTime

  static softDeleteColumn = 'supply_value_history_deleted_at'

  @column.dateTime({ columnName: 'supply_value_history_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Supplie, {
    foreignKey: 'supplyId',
    onQuery: (query) => {
      query.whereNull('supply_deleted_at')
    },
  })
  declare supply: relations.BelongsTo<typeof Supplie>
}
