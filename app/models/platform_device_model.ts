import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * Estados posibles de un modelo de dispositivo dentro de la oferta de GSTI.
 * Solo `vigente` puede elegirse al registrar unidades nuevas (R5).
 */
export type PlatformDeviceModelStatus = 'vigente' | 'en_validacion' | 'descontinuado'

/**
 * Modelo de dispositivo biométrico autorizado por GSTI (USRH1787189981870).
 * Catálogo global — sin business_unit_id ni withBusinessUnitScope mixin.
 * El slug es inmutable y es la llave con la que el landlord resuelve la foto
 * de referencia (`<slug>.webp` en el Space). Espeja sat_tax_regime.ts.
 */
export default class PlatformDeviceModel extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'platform_device_models'

  @column({ isPrimary: true })
  declare platformDeviceModelId: number

  @column()
  declare platformDeviceModelBrand: string

  @column()
  declare platformDeviceModelName: string

  @column()
  declare platformDeviceModelSlug: string

  @column()
  declare platformDeviceModelStatus: PlatformDeviceModelStatus

  @column()
  declare platformDeviceModelActive: number

  @column.dateTime({ autoCreate: true })
  declare platformDeviceModelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformDeviceModelUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'platform_device_model_deleted_at' })
  declare deletedAt: DateTime | null
}
