import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
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
 *         businessUnitId:
 *           type: number
 *           nullable: true
 *           description: Unidad de negocio dueña de la característica (alcance de lanzamiento SaaS)
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

export default class SupplieCaracteristic extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare supplieCaracteristicId: number

  /**
   * Marca de pertenencia. Nullable mientras el backfill
   * (`backfill:zones-supplies-business-unit`) no haya corrido en el entorno:
   * una característica en NULL queda fuera de toda consulta con contexto de
   * tenant, así que se pierde visibilidad, nunca aislamiento.
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde el tipo de activo padre, nunca del cuerpo.
   * El tipo ya está acotado por el mixin, así que un `supplyTypeId` de otra
   * empresa no resuelve y el alta falla en vez de cruzar empresas.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: SupplieCaracteristic) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const supplyType = await SupplyType.query()
        .where('supplyTypeId', instance.supplyTypeId)
        .first()
      return supplyType?.businessUnitId ? { businessUnitId: supplyType.businessUnitId } : null
    }, 'el tipo de activo')
  }

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
