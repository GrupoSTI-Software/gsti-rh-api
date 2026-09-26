import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/** Avance de subida por dispositivo y tabla (spec ADMS v2, 4.4). */
export default class AccessPointStamp extends compose(BaseModel, withBusinessUnitScope()) {
  static readonly table = 'access_point_stamps'

  @column({ isPrimary: true })
  declare accessPointStampId: number

  @column()
  declare accessPointId: number

  @column()
  declare businessUnitId: number

  @column()
  declare accessPointStampTable: string

  @column()
  declare accessPointStampValue: string

  @column.dateTime()
  declare accessPointStampLastUploadAt: DateTime | null

  @column()
  declare accessPointStampLastUploadLines: number | null

  @column.dateTime()
  declare accessPointStampResetAt: DateTime | null

  @column()
  declare accessPointStampResetByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare accessPointStampCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare accessPointStampUpdatedAt: DateTime
}
