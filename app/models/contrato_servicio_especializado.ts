import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasOne, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo, HasOne, ManyToMany, HasMany } from '@adonisjs/lucid/types/relations'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import BusinessUnit from '#models/business_unit'
import EmpresaContratante from '#models/empresa_contratante'
import Clausula15d from '#models/clausula_15d'
import RepseSpecializedService from '#models/repse_specialized_service'
import DocumentoContratoEspecializado from '#models/documento_contrato_especializado'

export type ContratoServicioEspecializadoEstatus =
  | 'borrador'
  | 'vigente'
  | 'vencido'
  | 'cancelado'

export default class ContratoServicioEspecializado extends compose(BaseModel, SoftDeletes) {
  static table = 'contratos_servicios_especializados'

  @column({ isPrimary: true, columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column({ columnName: 'empresa_contratante_id' })
  declare empresaContratanteId: number

  @column({ columnName: 'contrato_servicio_especializado_numero_contrato' })
  declare numeroContrato: string

  @column.date({ columnName: 'contrato_servicio_especializado_fecha_inicio' })
  declare fechaInicio: DateTime

  @column.date({ columnName: 'contrato_servicio_especializado_fecha_fin' })
  declare fechaFin: DateTime | null

  @column({ columnName: 'contrato_servicio_especializado_objeto_servicio' })
  declare objetoServicio: string

  @column({ columnName: 'contrato_servicio_especializado_monto_total' })
  declare montoTotal: number | null

  @column({ columnName: 'contrato_servicio_especializado_moneda' })
  declare moneda: string

  @column({ columnName: 'contrato_servicio_especializado_estatus' })
  declare estatus: ContratoServicioEspecializadoEstatus

  @column.dateTime({
    columnName: 'contrato_servicio_especializado_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'contrato_servicio_especializado_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'contrato_servicio_especializado_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => EmpresaContratante, {
    foreignKey: 'empresaContratanteId',
    localKey: 'empresaContratanteId',
  })
  declare empresaContratante: BelongsTo<typeof EmpresaContratante>

  @hasOne(() => Clausula15d, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare clausula15d: HasOne<typeof Clausula15d>

  @manyToMany(() => RepseSpecializedService, {
    pivotTable: 'contrato_servicio_repse',
    localKey: 'contratoServicioEspecializadoId',
    pivotForeignKey: 'contrato_servicio_especializado_id',
    relatedKey: 'repseSpecializedServiceId',
    pivotRelatedForeignKey: 'repse_specialized_service_id',
    pivotTimestamps: true,
  })
  declare repseSpecializedServices: ManyToMany<typeof RepseSpecializedService>

  @hasMany(() => DocumentoContratoEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare documentos: HasMany<typeof DocumentoContratoEspecializado>

  /**
   * Restringe la consulta a las unidades de negocio permitidas del tenant.
   */
  static forAllowedBusinessUnits(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>,
    allowedBusinessUnitIds: number[]
  ) {
    return query
      .whereNull('contrato_servicio_especializado_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
  }
}
