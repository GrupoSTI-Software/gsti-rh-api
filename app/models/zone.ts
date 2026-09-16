import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { TenantContext } from '#utils/tenant_context'

/**
 * @swagger
 * components:
 *   schemas:
 *     Zone:
 *       type: object
 *       properties:
 *         zoneId:
 *           type: number
 *           description: Zone id
 *         businessUnitId:
 *           type: number
 *           nullable: true
 *           description: Unidad de negocio dueña de la zona (alcance de lanzamiento SaaS)
 *         zoneName:
 *           type: string
 *           description: Zone name
 *         zoneAddress:
 *           type: string
 *           description: Zone address
 *         zonePolygon:
 *           type: string
 *           description: Zone polygon coordinates stored as JSON string
 *         zoneCreatedAt:
 *           type: string
 *         zoneUpdatedAt:
 *           type: string
 *         zoneDeletedAt:
 *           type: string
 */
export default class Zone extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare zoneId: number

  /**
   * Marca de pertenencia. Nullable mientras el backfill
   * (`backfill:zones-supplies-business-unit`) no haya corrido en el entorno:
   * una zona en NULL queda fuera de toda consulta con contexto de tenant, así
   * que se pierde visibilidad, nunca aislamiento.
   */
  @column()
  declare businessUnitId: number | null

  /**
   * Resuelve businessUnitId desde la unidad activa del request, nunca del
   * cuerpo: una zona es catálogo privado de la empresa y no tiene padre del
   * que derivarla.
   */
  @beforeCreate()
  static assignBusinessUnitId(instance: Zone) {
    if (instance.businessUnitId) return
    const [businessUnitId] = TenantContext.getScope()
    if (!businessUnitId) {
      throw new Error(
        'No se pudo resolver la unidad de negocio: no hay unidad activa en el alcance'
      )
    }
    instance.businessUnitId = businessUnitId
  }

  @column()
  declare zoneName: string

  @column()
  declare zoneThumbnail: string | null

  @column()
  declare zoneAddress: string

  @column()
  declare zonePolygon: string

  @column.dateTime({ autoCreate: true })
  declare zoneCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare zoneUpdatedAt: DateTime

  @column.dateTime({ columnName: 'zone_deleted_at' })
  declare deletedAt: DateTime | null
}


