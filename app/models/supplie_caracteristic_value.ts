import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { belongsTo } from '@adonisjs/lucid/orm'
import SupplieCaracteristic from './supplie_caracteristic.js'
import * as relations from '@adonisjs/lucid/types/relations'
import Supplie from './supplie.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     SupplieCaracteristicValue:
 *       type: object
 *       properties:
 *         supplieCaracteristicValueId:
 *           type: number
 *           description: Supplie caracteristic value ID
 *         businessUnitId:
 *           type: number
 *           nullable: true
 *           description: Unidad de negocio dueña del valor (alcance de lanzamiento SaaS)
 *         supplieCaracteristicId:
 *           type: number
 *           description: Supplie caracteristic ID
 *         supplieCaracteristicValueValue:
 *           type: string
 *           description: Supplie caracteristic value value
 *         supplieCaracteristicValueCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supplie caracteristic value was created
 *         supplieCaracteristicValueUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the supplie caracteristic value was last updated
 *         supplieCaracteristicValueDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the supplie caracteristic value was soft-deleted
 *       example:
 *         supplieCaracteristicValueId: 1
 *         supplieCaracteristicId: 1
 *         supplieCaracteristicValueValue: '100'
 *         supplieCaracteristicValueCreatedAt: '2025-02-12T12:00:00Z'
 *         supplieCaracteristicValueUpdatedAt: '2025-02-12T13:00:00Z'
 *         supplieCaracteristicValueDeletedAt: null
 */
export default class SupplieCaracteristicValue extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare supplieCaracteristicValueId: number

  /**
   * Marca de pertenencia. Nullable mientras el backfill
   * (`backfill:zones-supplies-business-unit`) no haya corrido en el entorno:
   * un valor en NULL queda fuera de toda consulta con contexto de tenant, así
   * que se pierde visibilidad, nunca aislamiento.
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde el activo padre, nunca del cuerpo. El activo
   * ya está acotado por el mixin, así que un `supplieId` de otra empresa no
   * resuelve y el alta falla en vez de cruzar empresas.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: SupplieCaracteristicValue) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const supplie = await Supplie.query().where('supplyId', instance.supplieId).first()
      return supplie?.businessUnitId ? { businessUnitId: supplie.businessUnitId } : null
    }, 'el activo')
  }

  @column()
  declare supplieCaracteristicId: number

  @column()
  declare supplieId: number

  @column()
  declare supplieCaracteristicValueValue: string | number | boolean | null

  @column.dateTime({ autoCreate: true })
  declare supplieCaracteristicValueCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare supplieCaracteristicValueUpdatedAt: DateTime

  @column.dateTime({ columnName: 'supplie_caracteristic_value_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => SupplieCaracteristic, {
    foreignKey: 'supplieCaracteristicId',
    onQuery: (query) => {
      query.whereNull('supplie_caracteristic_deleted_at')
    },
  })
  declare supplieCaracteristic: relations.BelongsTo<typeof SupplieCaracteristic>

  @belongsTo(() => Supplie, {
    foreignKey: 'supplieId',
    onQuery: (query) => {
      query.whereNull('supply_deleted_at')
    },
  })
  declare supplie: relations.BelongsTo<typeof Supplie>

  @hasMany(() => SupplieCaracteristicValue, {
    foreignKey: 'supplieCaracteristicId',
    onQuery: (query) => {
      query.whereNull('supplie_caracteristic_deleted_at')
    },
  })
  declare supplieCaracteristicValues: relations.HasMany<typeof SupplieCaracteristicValue>
}
