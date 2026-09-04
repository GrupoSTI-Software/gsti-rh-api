import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PlatformDevice from './platform_device.js'
import BusinessUnit from './business_unit.js'

/**
 * Registro de colocación de un aparato a una empresa cliente.
 * Una fila por entrega; el histórico se acumula y nunca se borra.
 * Ref: USRH1787189981876 · §10 del spec.
 *
 * Entrega abierta (vigente) = `releasedAt IS NULL`.
 * Sin mixin de scope de tenant — es dato de plataforma.
 */
export default class PlatformDeviceAssignment extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'platform_device_assignments'

  @column({ isPrimary: true })
  declare platformDeviceAssignmentId: number

  @column()
  declare platformDeviceId: number

  @column()
  declare businessUnitId: number

  /** Fecha en que el aparato fue entregado al cliente (no puede ser futura). */
  @column()
  declare platformDeviceAssignmentDeliveredAt: string

  /**
   * Fecha en que el aparato fue devuelto. NULL = sigue en el cliente.
   * Es el campo que sostiene el invariante de una sola entrega abierta
   * por unidad (junto con el candado transaccional del servicio).
   */
  @column()
  declare platformDeviceAssignmentReleasedAt: string | null

  /** ID del usuario de plataforma que registró la entrega (trazabilidad). */
  @column()
  declare platformDeviceAssignmentCreatedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare platformDeviceAssignmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformDeviceAssignmentUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'platform_device_assignment_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => PlatformDevice, {
    foreignKey: 'platformDeviceId',
    localKey: 'platformDeviceId',
  })
  declare device: BelongsTo<typeof PlatformDevice>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
