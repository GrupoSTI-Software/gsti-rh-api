import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import EmployeeTeleworkLocation from '#models/employee_telework_location'
import User from '#models/user'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import type {
  TeleworkChecklistApplicationStatus,
  TeleworkChecklistInvalidationReason,
  TeleworkChecklistMode,
  TeleworkChecklistOverallResult,
} from '#constants/telework_checklist'

/**
 * Aplicación de la lista de verificación de teletrabajo (VLRH-H1790812613870).
 *
 * Una fila por listado levantado. `status` manda sobre el ciclo de vida
 * (`vigente`, `vencida`, `invalidada`, `reemplazada`); sin soft delete y sin
 * ruta de borrado. No declara la columna generada
 * `telework_checklist_application_current_employee_id` ni su `UNIQUE`: su único
 * fin es la restricción de una lista vigente por empleado en la BD.
 */
export default class TeleworkChecklistApplication extends compose(
  BaseModel,
  withBusinessUnitScope()
) {
  static table = 'telework_checklist_applications'

  @column({ isPrimary: true })
  declare teleworkChecklistApplicationId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeTeleworkLocationId: number | null

  /** Modo de aplicación: `autoaplicada` o `visita_csh`. */
  @column()
  declare teleworkChecklistApplicationMode: TeleworkChecklistMode

  /** Estado de la aplicación (`vigente`, `vencida`, `invalidada`, `reemplazada`). */
  @column()
  declare teleworkChecklistApplicationStatus: TeleworkChecklistApplicationStatus

  /** Resultado global calculado al registrar (`aprobada` o `no_aprobada`). */
  @column()
  declare teleworkChecklistApplicationOverallResult: TeleworkChecklistOverallResult

  /** Fecha de aplicación en calendario CDMX. */
  @column.date()
  declare teleworkChecklistApplicationAppliedAt: DateTime

  /** Snapshot de la periodicidad de revalidación (meses) al aplicar. */
  @column()
  declare teleworkChecklistApplicationRevalidationPeriodMonths: number

  /** Fecha de caducidad (`appliedAt` más la periodicidad de revalidación). */
  @column.date()
  declare teleworkChecklistApplicationExpiresAt: DateTime

  /** Nombre del inspector; obligatorio en `visita_csh`. */
  @column()
  declare teleworkChecklistApplicationInspectorName: string | null

  @column()
  declare teleworkChecklistApplicationNotes: string | null

  @column()
  declare teleworkChecklistApplicationAppliedByUserId: number

  @column.dateTime()
  declare teleworkChecklistApplicationInvalidatedAt: DateTime | null

  /** Motivo de invalidación (`cambio_de_domicilio`). */
  @column()
  declare teleworkChecklistApplicationInvalidationReason: TeleworkChecklistInvalidationReason | null

  @column()
  declare teleworkChecklistApplicationInvalidatedByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare teleworkChecklistApplicationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare teleworkChecklistApplicationUpdatedAt: DateTime

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => EmployeeTeleworkLocation, { foreignKey: 'employeeTeleworkLocationId' })
  declare employeeTeleworkLocation: BelongsTo<typeof EmployeeTeleworkLocation>

  @belongsTo(() => User, { foreignKey: 'teleworkChecklistApplicationAppliedByUserId' })
  declare appliedByUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'teleworkChecklistApplicationInvalidatedByUserId' })
  declare invalidatedByUser: BelongsTo<typeof User>
}
