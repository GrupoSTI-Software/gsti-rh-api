import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * @swagger
 * components:
 *   schemas:
 *     AccessPointResyncPending:
 *       type: object
 *       properties:
 *         accessPointResyncPendingId:
 *           type: number
 *         businessUnitId:
 *           type: number
 *         employeeId:
 *           type: number
 *         accessPointEmployeeId:
 *           type: number
 *           description: Vínculo colaborador↔checador del que la baja sacó a la persona
 *         accessPointResyncPendingStatusAtMark:
 *           type: string
 *           description: Estado del vínculo al reactivar (rastro)
 *         accessPointResyncPendingMarkedByUserId:
 *           type: number
 *           nullable: true
 *         accessPointResyncPendingResolvedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         accessPointResyncPendingResolution:
 *           type: string
 *           nullable: true
 *           enum: [assigned, superseded]
 */
/**
 * Checador pendiente de sincronizar tras deshacer una baja
 * (VLRH-H1790812613831). Abierta mientras `resolvedAt` es nulo; se cierra por
 * estado y nunca se borra. La columna generada `open_key` del UNIQUE no se
 * declara: la mantiene MySQL.
 */
export default class AccessPointResyncPending extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'access_point_resync_pendings'

  @column({ isPrimary: true })
  declare accessPointResyncPendingId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number

  @column()
  declare accessPointEmployeeId: number

  @column()
  declare accessPointResyncPendingStatusAtMark: string

  @column()
  declare accessPointResyncPendingMarkedByUserId: number | null

  @column.dateTime()
  declare accessPointResyncPendingResolvedAt: DateTime | null

  @column()
  declare accessPointResyncPendingResolution: string | null

  @column.dateTime({ autoCreate: true })
  declare accessPointResyncPendingCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointResyncPendingUpdatedAt: DateTime | null
}
