import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import BusinessUnit from '#models/business_unit'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import Employee from '#models/employee'

/**
 * Asignación de un trabajador a un contrato de servicios especializados REPSE.
 */
export default class AsignacionContratoEspecializado extends compose(BaseModel, SoftDeletes) {
  static table = 'asignaciones_contrato_especializado'

  @column({ isPrimary: true, columnName: 'asignacion_contrato_especializado_id' })
  declare asignacionContratoEspecializadoId: number

  @column({ columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'employee_id' })
  declare employeeId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column.date({ columnName: 'asignacion_contrato_especializado_fecha_inicio' })
  declare fechaInicio: DateTime

  @column.date({ columnName: 'asignacion_contrato_especializado_fecha_fin' })
  declare fechaFin: DateTime | null

  @column({ columnName: 'asignacion_contrato_especializado_porcentaje_tiempo' })
  declare porcentajeTiempo: number

  @column.dateTime({
    columnName: 'asignacion_contrato_especializado_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'asignacion_contrato_especializado_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'asignacion_contrato_especializado_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ContratoServicioEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare contrato: BelongsTo<typeof ContratoServicioEspecializado>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    localKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  /**
   * Restringe la consulta a las unidades de negocio permitidas del tenant.
   */
  static forAllowedBusinessUnits(
    query: ModelQueryBuilderContract<typeof AsignacionContratoEspecializado>,
    allowedBusinessUnitIds: number[]
  ) {
    return query
      .whereNull('asignacion_contrato_especializado_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
  }

  /**
   * Filtra asignaciones vigentes en una fecha de referencia (inclusive).
   */
  static vigentesEn(
    query: ModelQueryBuilderContract<typeof AsignacionContratoEspecializado>,
    fechaIso: string
  ) {
    return query
      .where('asignacion_contrato_especializado_fecha_inicio', '<=', fechaIso)
      .where((group) => {
        group
          .whereNull('asignacion_contrato_especializado_fecha_fin')
          .orWhere('asignacion_contrato_especializado_fecha_fin', '>=', fechaIso)
      })
  }
}
