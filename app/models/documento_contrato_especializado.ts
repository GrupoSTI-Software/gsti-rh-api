import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import BusinessUnit from '#models/business_unit'

export type DocumentoContratoEspecializadoOrigen = 'subido' | 'firmado_canvas'

export default class DocumentoContratoEspecializado extends compose(BaseModel, SoftDeletes) {
  static table = 'documentos_contrato_especializado'

  @column({ isPrimary: true, columnName: 'documento_contrato_especializado_id' })
  declare documentoContratoEspecializadoId: number

  @column({ columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column({ columnName: 'documento_contrato_especializado_origen' })
  declare origen: DocumentoContratoEspecializadoOrigen

  @column({ columnName: 'documento_contrato_especializado_vigente' })
  declare vigente: boolean

  @column.date({ columnName: 'documento_contrato_especializado_fecha_inicio_vigencia' })
  declare fechaInicioVigencia: DateTime

  @column.date({ columnName: 'documento_contrato_especializado_fecha_vencimiento' })
  declare fechaVencimiento: DateTime

  @column({ columnName: 'documento_contrato_especializado_nombre_archivo' })
  declare nombreArchivo: string

  @column({ columnName: 'documento_contrato_especializado_storage_key' })
  declare storageKey: string

  @column({ columnName: 'documento_contrato_especializado_mime_type' })
  declare mimeType: string

  @column({ columnName: 'documento_contrato_especializado_tamano_bytes' })
  declare tamanoBytes: number

  @column({ columnName: 'documento_contrato_especializado_subido_por' })
  declare subidoPor: number | null

  @column.dateTime({
    columnName: 'documento_contrato_especializado_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'documento_contrato_especializado_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'documento_contrato_especializado_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ContratoServicioEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare contrato: BelongsTo<typeof ContratoServicioEspecializado>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
