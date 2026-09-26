import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { belongsTo } from '@adonisjs/lucid/orm'
import SupplyType from './supply_type.js'
import * as relations from '@adonisjs/lucid/types/relations'
import SupplieCaracteristic from './supplie_caracteristic.js'
import SupplieCaracteristicValue from './supplie_caracteristic_value.js'
import SupplyValueHistory from './supply_value_history.js'

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
 *         businessUnitId:
 *           type: number
 *           nullable: true
 *           description: Unidad de negocio dueña del activo (alcance de lanzamiento SaaS)
 *         supplyFileNumber:
 *           type: string
 *           maxLength: 50
 *           description: Folio alfanumérico del activo, único por empresa entre activos no borrados
 *         supplyName:
 *           type: string
 *           description: Supply name
 *         supplySerialNumber:
 *           type: string
 *           maxLength: 100
 *           nullable: true
 *           description: Número de serie del fabricante
 *         supplyDescription:
 *           type: string
 *           description: Supply description
 *         supplyTypeId:
 *           type: number
 *           description: Supply type ID
 *         supplyAcquisitionDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha de adquisición del insumo
 *         supplyAcquisitionValue:
 *           type: number
 *           format: decimal
 *           minimum: 0
 *           nullable: true
 *           description: Valor original de adquisición del insumo (no permite valores negativos)
 *         supplyStatus:
 *           type: string
 *           description: Supply status
 *         supplyDeactivationReason:
 *           type: string
 *           description: Supply deactivation reason and reason description
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
 *         supplyFileNumber: 'LAP-0012'
 *         supplyName: 'Supply Name'
 *         supplyDescription: 'Supply Description'
 *         supplyTypeId: 1
 *         supplyAcquisitionDate: '2025-01-15'
 *         supplyAcquisitionValue: 2500.00
 *         supplyStatus: 'active'
 *         supplyDeactivationReason: 'Supply Deactivation Reason'
 *         supplyDeactivationDate: '2025-02-12T12:00:00Z'
 *         supplyCreatedAt: '2025-02-12T12:00:00Z'
 *         supplyUpdatedAt: '2025-02-12T13:00:00Z'
 *         supplyDeletedAt: null
 */

export default class Supplie extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {

  @column({ isPrimary: true })
  declare supplyId: number

  /**
   * Marca de pertenencia. Nullable mientras el backfill
   * (`backfill:zones-supplies-business-unit`) no haya corrido en el entorno:
   * un activo en NULL queda fuera de toda consulta con contexto de tenant, así
   * que se pierde visibilidad, nunca aislamiento.
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde el tipo de activo padre, nunca del cuerpo.
   * El tipo ya está acotado por el mixin, así que un `supplyTypeId` de otra
   * empresa no resuelve y el alta falla en vez de cruzar empresas.
   */
  @beforeCreate()
  static async assignBusinessUnitId(instance: Supplie) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const supplyType = await SupplyType.query()
        .where('supplyTypeId', instance.supplyTypeId)
        .first()
      return supplyType?.businessUnitId ? { businessUnitId: supplyType.businessUnitId } : null
    }, 'el tipo de activo')
  }

  /** Folio alfanumérico, único por empresa entre activos no borrados. */
  @column()
  declare supplyFileNumber: string

  @column()
  declare supplyName: string

  /** Número de serie del fabricante; opcional y aparte de la descripción. */
  @column()
  declare supplySerialNumber: string | null

  @column()
  declare supplyDescription: string | null

  @column()
  declare supplyTypeId: number

  @column.date()
  declare supplyAcquisitionDate: DateTime | null

  @column()
  declare supplyAcquisitionValue: number | null

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

  @hasMany(() => SupplyValueHistory, {
    foreignKey: 'supplyId',
  })
  declare supplyValueHistories: relations.HasMany<typeof SupplyValueHistory>
}
