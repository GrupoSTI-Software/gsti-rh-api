import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import PlatformDeviceModel from './platform_device_model.js'
import PlatformDeviceAssignment from './platform_device_assignment.js'

/** Indica si el aparato fue comprado por GSTI o pertenece al cliente. */
export type PlatformDeviceOrigin = 'propia' | 'del_cliente'

/**
 * Estado de existencia del aparato dentro del inventario.
 * - `disponible`: libre para colocar (aplica solo a `propia`).
 * - `asignada`: entregado a un tenant (entrega 1876).
 * - `retirada`: fuera de circulación (entrega 1877).
 */
export type PlatformDeviceStockStatus = 'disponible' | 'asignada' | 'retirada'

/**
 * Motivo del retiro definitivo de un aparato (USRH1787189981877 · C-4 del set).
 * `del_cliente` está reservado para retiro automático al devolver un aparato
 * de origen del_cliente; los 4 motivos visibles al operador son los demás.
 */
export type PlatformDeviceRetireReason =
  | 'danado'
  | 'obsoleto'
  | 'vendido'
  | 'extraviado'
  | 'del_cliente'

/**
 * Unidad concreta del inventario biométrico de GSTI (USRH1787189981873).
 * Cada fila es un aparato físico identificado por su número de serie.
 * Catálogo global — sin `business_unit_id` ni mixin de scope de tenant.
 * Molde: `app/models/sat_tax_regime.ts:9`.
 */
export default class PlatformDevice extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'platform_devices'

  @column({ isPrimary: true })
  declare platformDeviceId: number

  @column()
  declare platformDeviceModelId: number

  @column()
  declare platformDeviceSerialNumber: string

  @column()
  declare platformDeviceOrigin: PlatformDeviceOrigin

  @column()
  declare platformDeviceStockStatus: PlatformDeviceStockStatus

  /**
   * Motivo por el que el aparato fue retirado del inventario. NULL = no retirado.
   * Una vez establecido no se revierte (el retiro es definitivo, RN4 del spec 1877).
   */
  @column()
  declare platformDeviceRetireReason: PlatformDeviceRetireReason | null

  /** Fecha en que se ejecutó el retiro (YYYY-MM-DD). NULL = no retirado. */
  @column()
  declare platformDeviceRetiredAt: string | null

  /** Costo de adquisición en centavos MXN. Nulo para aparatos del cliente. */
  @column()
  declare platformDeviceAcquisitionCostCents: number | null

  /** Fecha de compra (YYYY-MM-DD). Nula para aparatos del cliente. */
  @column()
  declare platformDeviceAcquisitionDate: string | null

  /** Vigencia del registro. Baja lógica desde el día uno (R12). */
  @column()
  declare platformDeviceActive: number

  @column.dateTime({ autoCreate: true })
  declare platformDeviceCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformDeviceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'platform_device_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => PlatformDeviceModel, {
    foreignKey: 'platformDeviceModelId',
    localKey: 'platformDeviceModelId',
  })
  declare deviceModel: BelongsTo<typeof PlatformDeviceModel>

  @hasMany(() => PlatformDeviceAssignment, {
    foreignKey: 'platformDeviceId',
    localKey: 'platformDeviceId',
  })
  declare assignments: HasMany<typeof PlatformDeviceAssignment>
}
