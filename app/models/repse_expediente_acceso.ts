import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import RepseExpedienteDocumento from '#models/repse_expediente_documento'
import User from '#models/user'
import type { RepseExpedienteAccion } from '#modules/repse-providers/expediente/expediente.constants.js'

export default class RepseExpedienteAcceso extends BaseModel {
  static table = 'repse_expediente_accesos'

  @column({ isPrimary: true })
  declare repseExpedienteAccesoId: number

  @column({ columnName: 'repse_expediente_documento_id' })
  declare repseExpedienteDocumentoId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'repse_expediente_acceso_accion' })
  declare accion: RepseExpedienteAccion

  @column({ columnName: 'repse_expediente_acceso_user_id' })
  declare userId: number

  @column.dateTime({
    columnName: 'repse_expediente_acceso_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @belongsTo(() => RepseExpedienteDocumento, {
    foreignKey: 'repseExpedienteDocumentoId',
    localKey: 'repseExpedienteDocumentoId',
  })
  declare documento: BelongsTo<typeof RepseExpedienteDocumento>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, {
    foreignKey: 'userId',
    localKey: 'userId',
  })
  declare user: BelongsTo<typeof User>
}
