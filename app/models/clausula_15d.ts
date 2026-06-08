import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'

export type CompromisoDocumentalTipo =
  | 'cfdi_nomina'
  | 'comprobante_imss'
  | 'comprobante_infonavit'
  | 'otro'

export type CompromisoDocumentalPeriodicidad =
  | 'mensual'
  | 'bimestral'
  | 'cuatrimestral'
  | 'anual'
  | 'por_evento'

export interface CompromisoDocumental {
  tipo: CompromisoDocumentalTipo
  descripcion: string
  periodicidad: CompromisoDocumentalPeriodicidad
}

export default class Clausula15d extends BaseModel {
  static table = 'clausulas_15d'

  @column({ isPrimary: true, columnName: 'clausula_15d_id' })
  declare clausula15dId: number

  @column({ columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'clausula_15d_folio_repse' })
  declare folioRepse: string

  @column({ columnName: 'clausula_15d_objeto_detallado' })
  declare objetoDetallado: string

  @column({ columnName: 'clausula_15d_numero_trabajadores_aprox' })
  declare numeroTrabajadoresAprox: number

  @column.date({ columnName: 'clausula_15d_fecha_inicio_servicio' })
  declare fechaInicioServicio: DateTime

  @column.date({ columnName: 'clausula_15d_fecha_fin_servicio' })
  declare fechaFinServicio: DateTime | null

  @column({
    columnName: 'clausula_15d_compromisos_documentales',
    prepare: (value: CompromisoDocumental[]) => JSON.stringify(value),
    consume: (value: string | CompromisoDocumental[]) =>
      typeof value === 'string' ? (JSON.parse(value) as CompromisoDocumental[]) : value,
  })
  declare compromisosDocumentales: CompromisoDocumental[]

  @column({ columnName: 'clausula_15d_responsabilidad_solidaria_aceptada' })
  declare responsabilidadSolidariaAceptada: boolean

  @column({ columnName: 'clausula_15d_texto_responsabilidad_solidaria' })
  declare textoResponsabilidadSolidaria: string

  @column.dateTime({ columnName: 'clausula_15d_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'clausula_15d_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @belongsTo(() => ContratoServicioEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare contrato: BelongsTo<typeof ContratoServicioEspecializado>
}
