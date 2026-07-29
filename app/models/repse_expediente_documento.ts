import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import ProveedorRepse from '#models/proveedor_repse'
import User from '#models/user'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type { RepseExpedienteDocumentoTipo } from '#modules/repse-providers/expediente/expediente.constants.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     RepseExpedienteDocumento:
 *       type: object
 *       properties:
 *         repseExpedienteDocumentoId:
 *           type: integer
 *         proveedorRepseId:
 *           type: integer
 *         businessUnitId:
 *           type: integer
 *         tipo:
 *           type: string
 *         anio:
 *           type: integer
 *         mes:
 *           type: integer
 *           nullable: true
 *         cuatrimestre:
 *           type: integer
 *           nullable: true
 *         fechaDocumento:
 *           type: string
 *           format: date
 *           nullable: true
 *         conservarHasta:
 *           type: string
 *           format: date
 *         nombreArchivo:
 *           type: string
 *         mimeType:
 *           type: string
 *         tamanoBytes:
 *           type: integer
 *         subidoPorUserId:
 *           type: integer
 *           nullable: true
 *         repseExpedienteDocumentoCreatedAt:
 *           type: string
 *           format: date-time
 */
export default class RepseExpedienteDocumento extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'repse_expediente_documentos'

  @column({ isPrimary: true })
  declare repseExpedienteDocumentoId: number

  @column({ columnName: 'proveedor_repse_id' })
  declare proveedorRepseId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'repse_expediente_documento_tipo' })
  declare tipo: RepseExpedienteDocumentoTipo

  @column({ columnName: 'repse_expediente_documento_anio' })
  declare anio: number

  @column({ columnName: 'repse_expediente_documento_mes' })
  declare mes: number | null

  @column({ columnName: 'repse_expediente_documento_cuatrimestre' })
  declare cuatrimestre: number | null

  @column.date({ columnName: 'repse_expediente_documento_fecha_documento' })
  declare fechaDocumento: DateTime | null

  @column.date({ columnName: 'repse_expediente_documento_conservar_hasta' })
  declare conservarHasta: DateTime

  @column({ columnName: 'repse_expediente_documento_nombre_archivo' })
  declare nombreArchivo: string

  @column({ columnName: 'repse_expediente_documento_storage_key' })
  declare storageKey: string

  @column({ columnName: 'repse_expediente_documento_mime_type' })
  declare mimeType: string

  @column({ columnName: 'repse_expediente_documento_tamano_bytes' })
  declare tamanoBytes: number

  @column({ columnName: 'repse_expediente_documento_subido_por' })
  declare subidoPorUserId: number | null

  @column.dateTime({
    columnName: 'repse_expediente_documento_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'repse_expediente_documento_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'repse_expediente_documento_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ProveedorRepse, {
    foreignKey: 'proveedorRepseId',
    localKey: 'proveedorRepseId',
  })
  declare proveedor: BelongsTo<typeof ProveedorRepse>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, {
    foreignKey: 'subidoPorUserId',
    localKey: 'userId',
  })
  declare subidoPor: BelongsTo<typeof User>
}
