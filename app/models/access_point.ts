import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { BaseModel, beforeCreate, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import BusinessUnit from './business_unit.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { generateChannelSecret } from '#modules/adms/channel/channel_secret'
import PlatformDevice from './platform_device.js'

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
 *         platformDeviceId:
 *           type: number
 *           nullable: true
 *           description: Amarre hacia la unidad del inventario de plataforma (USRH1787193625428). Null si no viene de una entrega nuestra.
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

  /**
   * Amarre hacia la unidad física del inventario de plataforma
   * (USRH1787193625428). NULL para los equipos preexistentes y los que el
   * cliente da de alta a mano; lo puebla "Precargar el punto de acceso del
   * tenant al asignar la unidad" (USRH1787189981879).
   */
  @column()
  declare platformDeviceId: number | null

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

  /** Zona IANA del dispositivo; override de la de la empresa (spec ADMS 5.3). */
  @column()
  declare accessPointTimezone: string | null

  /**
   * CIDR desde los que el canal acepta a este equipo. NULL = sin restriccion.
   * Fail-closed solo cuando esta configurado (spec ADMS 13, regla 10).
   */
  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | string[] | null) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return JSON.parse(value) as string[]
      return value
    },
  })
  declare accessPointAllowedCidrs: string[] | null

  /**
   * Secreto que el equipo lleva en la direccion del servidor.
   *
   * Cifrado en reposo. `serializeAs: null` para que no salga en ninguna
   * respuesta por accidente: se entrega por su propia via --al reclamar el
   * equipo o al rotarlo-- y solo a quien va a teclearlo en el aparato.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serializeAs: null,
  })
  declare accessPointChannelSecret: string | null

  @column.dateTime()
  declare accessPointChannelSecretSetAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare accessPointCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointUpdatedAt: DateTime

  /**
   * Todo checador nace con su direccion propia, sea cual sea la puerta.
   *
   * Hay tres vias de alta --el reclamo de una cuarentena, la entrega desde el
   * inventario y el alta a mano del Backoffice-- y generar el secreto en cada
   * una significaba que la que se olvidara dejaria equipos sin direccion: en
   * convivencia mientras dura, y sin canal el dia del corte. Aqui se cubren las
   * tres y las que vengan.
   *
   * No se regenera si ya viene puesto: el reclamo entrega el suyo y este hook
   * no debe pisarlo.
   */
  @beforeCreate()
  static assignChannelSecret(accessPoint: AccessPoint) {
    if (accessPoint.accessPointChannelSecret) return
    accessPoint.accessPointChannelSecret = generateChannelSecret()
    accessPoint.accessPointChannelSecretSetAt = DateTime.utc()
  }

  @column.dateTime({ columnName: 'access_point_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => PlatformDevice, {
    foreignKey: 'platformDeviceId',
  })
  declare platformDevice: BelongsTo<typeof PlatformDevice>
}
