import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import BusinessUnit from './business_unit.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * @swagger
 * components:
 *   schemas:
 *     AccessPoint:
 *       type: object
 *       properties:
 *         accessPointId:
 *           type: number
 *           description: Access point id
 *         accessPointName:
 *           type: string
 *           description: Access point name or alias
 *         businessUnitId:
 *           type: number
 *           description: Business unit id
 *         accessPointActive:
 *           type: number
 *           description: Active status (0 = inactive, 1 = active)
 *           default: 0
 *         accessPointSerialNumber:
 *           type: string
 *           description: Serial number of the device
 *         accessPointDeviceName:
 *           type: string
 *           description: Device name
 *         accessPointIp:
 *           type: string
 *           description: IP address
 *         accessPointMac:
 *           type: string
 *           description: MAC address
 *         accessPointFirmware:
 *           type: string
 *           description: Firmware version
 *         accessPointPlatform:
 *           type: string
 *           description: Platform information
 *         accessPointStatus:
 *           type: number
 *           description: Connection status (0 = offline, 1 = online)
 *           default: 0
 *         accessPointLastConnection:
 *           type: string
 *           description: Last connection timestamp
 *         accessPointCreatedAt:
 *           type: string
 *         accessPointUpdatedAt:
 *           type: string
 *         accessPointDeletedAt:
 *           type: string
 */
/**
 * Compone `withBusinessUnitScope()` (USRH1784259058567, defensa en
 * profundidad): la columna `businessUnitId` ya existía NOT NULL poblada. Su
 * ruta (`access_point_routes.ts`) ya montaba `businessScope()` de una HU
 * anterior — el mixin refuerza el filtro que hoy se hacía a mano en el
 * service/controller.
 */
export default class AccessPoint extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare accessPointId: number

  @column()
  declare accessPointName: string

  @column()
  declare businessUnitId: number

  @column()
  declare accessPointActive: number

  @column()
  declare accessPointSerialNumber: string | null

  @column()
  declare accessPointDeviceName: string | null

  @column()
  declare accessPointIp: string | null

  @column()
  declare accessPointMac: string | null

  @column()
  declare accessPointFirmware: string | null

  @column()
  declare accessPointPlatform: string | null

  @column()
  declare accessPointStatus: number

  @column.dateTime()
  declare accessPointLastConnection: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare accessPointCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointUpdatedAt: DateTime

  @column.dateTime({ columnName: 'access_point_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
