import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type ReportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
/**
 * `assistance_all` = empresa; `assistance_employee` = un solo empleado
 * (detalle); `assistance_incident_summary` = resumen de incidencias
 * (empresa o un empleado, según `employeeId`).
 */
export type ReportJobType = 'assistance_all' | 'assistance_employee' | 'assistance_incident_summary'

export interface ReportJobFilters {
  filterDate: string
  filterDateEnd: string
  filterDatePay?: string
  userResponsibleId?: number | null
  businessUnitId?: number
  payrollBusinessUnitId?: number
  branchNameIds?: number[]
  departmentsList: number[]
  locale: string
  /** Obligatorio cuando `reportJobType === 'assistance_employee'` o `assistance_incident_summary` en la ruta by-employee. */
  employeeId?: number
  /**
   * Resueltos por el servidor (`RoleService.hasAccess`) al encolar el job de
   * `assistance_incident_summary`; NUNCA aceptados como flag del cliente.
   * Se persisten aquí para que el worker asíncrono los use sin re-resolver
   * el rol (el rol pudo cambiar entre el encolado y la ejecución, pero la
   * decisión de seguridad ya se tomó server-side al momento del encolado).
   */
  canDisplayPaymentsSummary?: boolean
  canDisplayDiscountsSummary?: boolean
}

export default class ReportJob extends BaseModel {
  static table = 'report_jobs'

  @column({ isPrimary: true })
  declare reportJobId: string

  @column()
  declare userId: number

  @column()
  declare reportJobType: ReportJobType

  @column({
    prepare: (value: ReportJobFilters) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare reportJobFilters: ReportJobFilters

  @column({
    prepare: (value: number[]) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare reportJobAllowedBusinessUnitIds: number[]

  @column()
  declare reportJobStatus: ReportJobStatus

  @column()
  declare reportJobProgressCurrent: number

  @column()
  declare reportJobProgressTotal: number

  @column()
  declare reportJobFileKey: string | null

  @column()
  declare reportJobFileName: string | null

  @column()
  declare reportJobErrorMessage: string | null

  @column.dateTime()
  declare reportJobCompletedAt: DateTime | null

  @column.dateTime()
  declare reportJobExpiresAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}
