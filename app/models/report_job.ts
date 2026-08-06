import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type ReportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
/** `assistance_all` = empresa; `assistance_employee` = un solo empleado (detalle). */
export type ReportJobType = 'assistance_all' | 'assistance_employee'

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
  /** Obligatorio cuando `reportJobType === 'assistance_employee'`. */
  employeeId?: number
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
