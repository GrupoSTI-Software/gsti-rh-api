import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeUpdate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import DocumentoContratoEspecializado from '#models/documento_contrato_especializado'
import type { CompromisoDocumental } from '#models/clausula_15d'
import { VersionContratoEspecializadoError } from '../exceptions/version_contrato_especializado_error.js'
import { VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/version_contrato_especializado_error_codes.js'

export type VersionContratoEspecializadoTipoCambio = 'renovacion' | 'addendum'

export type Anexo15dSnapshot = {
  folioRepse: string
  objetoDetallado: string
  numeroTrabajadoresAprox: number
  fechaInicioServicio: string | null
  fechaFinServicio: string | null
  compromisosDocumentales: CompromisoDocumental[]
  responsabilidadSolidariaAceptada: boolean
  textoResponsabilidadSolidaria: string
}

/** Columnas inmutables del snapshot; solo `deletedAt` puede mutarse (soft delete futuro). */
const IMMUTABLE_SNAPSHOT_COLUMNS = [
  'contratoServicioEspecializadoId',
  'businessUnitId',
  'numero',
  'tipoCambio',
  'motivo',
  'fechaCambio',
  'snapshotFechaInicio',
  'snapshotFechaFin',
  'anexo15dSnapshot',
  'documentoVigenteId',
  'creadoPor',
] as const

/**
 * Versión histórica write-once de un contrato de servicios especializados REPSE.
 */
export default class VersionContratoEspecializado extends compose(BaseModel, SoftDeletes) {
  static table = 'versiones_contrato_especializado'

  @column({ isPrimary: true, columnName: 'version_contrato_especializado_id' })
  declare versionContratoEspecializadoId: number

  @column({ columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column({ columnName: 'version_contrato_especializado_numero' })
  declare numero: number

  @column({ columnName: 'version_contrato_especializado_tipo_cambio' })
  declare tipoCambio: VersionContratoEspecializadoTipoCambio

  @column({ columnName: 'version_contrato_especializado_motivo' })
  declare motivo: string

  @column.dateTime({ columnName: 'version_contrato_especializado_fecha_cambio' })
  declare fechaCambio: DateTime

  @column.date({ columnName: 'version_contrato_especializado_snapshot_fecha_inicio' })
  declare snapshotFechaInicio: DateTime

  @column.date({ columnName: 'version_contrato_especializado_snapshot_fecha_fin' })
  declare snapshotFechaFin: DateTime | null

  @column({
    columnName: 'version_contrato_especializado_anexo15d_snapshot',
    prepare: (value: Anexo15dSnapshot) => JSON.stringify(value),
    consume: (value: string | Anexo15dSnapshot) =>
      typeof value === 'string' ? (JSON.parse(value) as Anexo15dSnapshot) : value,
  })
  declare anexo15dSnapshot: Anexo15dSnapshot

  @column({ columnName: 'version_contrato_especializado_documento_vigente_id' })
  declare documentoVigenteId: number | null

  @column({ columnName: 'version_contrato_especializado_creado_por' })
  declare creadoPor: number | null

  @column.dateTime({
    columnName: 'version_contrato_especializado_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'version_contrato_especializado_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'version_contrato_especializado_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ContratoServicioEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare contrato: BelongsTo<typeof ContratoServicioEspecializado>

  @belongsTo(() => DocumentoContratoEspecializado, {
    foreignKey: 'documentoVigenteId',
    localKey: 'documentoContratoEspecializadoId',
  })
  declare documentoVigente: BelongsTo<typeof DocumentoContratoEspecializado>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @beforeUpdate()
  static rejectImmutableContentMutation(version: VersionContratoEspecializado) {
    if (!version.$original) {
      return
    }

    for (const fieldName of IMMUTABLE_SNAPSHOT_COLUMNS) {
      const original = version.$original[fieldName]
      const current = version[fieldName]
      if (JSON.stringify(original) !== JSON.stringify(current)) {
        throw new VersionContratoEspecializadoError(
          'El contenido de una versión histórica no puede modificarse.',
          VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.IMMUTABLE,
          409,
          'version-inmutable',
          'Las versiones históricas son inmutables.'
        )
      }
    }
  }
}
