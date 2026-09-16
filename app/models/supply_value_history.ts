import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
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
 *         businessUnitId:
 *           type: number
 *           nullable: true
 *           description: Unidad de negocio dueña del historial (alcance de lanzamiento SaaS)
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
export default class SupplyValueHistory extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'supply_value_histories'

  @column({ isPrimary: true })
  declare supplyValueHistoryId: number

  /**
   * Marca de pertenencia. Nullable mientras el backfill
   * (`backfill:zones-supplies-business-unit`) no haya corrido en el entorno:
   * un registro en NULL queda fuera de toda consulta con contexto de tenant,
   * así que se pierde visibilidad, nunca aislamiento.
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde el activo padre, nunca del cuerpo. El activo
   * ya está acotado por el mixin, así que un `supplyId` de otra empresa no
   * resuelve y el alta falla en vez de cruzar empresas.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: SupplyValueHistory) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const supplie = await Supplie.query().where('supplyId', instance.supplyId).first()
      return supplie?.businessUnitId ? { businessUnitId: supplie.businessUnitId } : null
    }, 'el activo')
  }

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
