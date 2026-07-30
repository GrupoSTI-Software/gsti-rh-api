import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import RepseRegistration from '#models/repse_registration'
import type { RepseFolioAvisoTipoValue } from '#constants/repse_folio_aviso'

/**
 * Bitácora de avisos automáticos de vigencia del folio REPSE.
 * Mecanismo de idempotencia del comando `repse:notify-folio-expiring`.
 *
 * Sin `withBusinessUnitScope()`: el cron corre fuera de request y el
 * aislamiento por empresa lo resuelve la segmentación del service.
 */
export default class RepseFolioAviso extends compose(BaseModel, SoftDeletes) {
  static table = 'repse_folio_avisos'

  @column({ isPrimary: true })
  declare repseFolioAvisoId: number

  @column()
  declare repseRegistrationId: number

  @column({ columnName: 'repse_folio_aviso_tipo' })
  declare repseFolioAvisoTipo: RepseFolioAvisoTipoValue

  @column({ columnName: 'repse_folio_aviso_periodo_clave' })
  declare repseFolioAvisoPeriodoClave: string

  @column.dateTime({ columnName: 'repse_folio_aviso_enviado_en' })
  declare repseFolioAvisoEnviadoEn: DateTime

  @column.dateTime({ autoCreate: true, columnName: 'repse_folio_aviso_created_at' })
  declare repseFolioAvisoCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'repse_folio_aviso_updated_at' })
  declare repseFolioAvisoUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'repse_folio_aviso_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => RepseRegistration, {
    foreignKey: 'repseRegistrationId',
    localKey: 'repseRegistrationId',
  })
  declare repseRegistration: BelongsTo<typeof RepseRegistration>
}
