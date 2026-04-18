import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import Employee from './employee.js'
import VacationSetting from './vacation_setting.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     VacationDeduction:
 *       type: object
 *       properties:
 *         vacationDeductionId:
 *           type: number
 *           description: ID de la deducción de vacaciones
 *         employeeId:
 *           type: number
 *           description: ID del empleado al que se aplica la deducción
 *         vacationSettingId:
 *           type: number
 *           description: ID del periodo de vacaciones (vacation setting)
 *         vacationDeductionDays:
 *           type: number
 *           description: Número de días deducidos
 *         vacationDeductionDescription:
 *           type: string
 *           description: Descripción opcional de la razón de la deducción
 *         vacationDeductionCreatedAt:
 *           type: string
 *           format: date-time
 *         vacationDeductionUpdatedAt:
 *           type: string
 *           format: date-time
 *         vacationDeductionDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class VacationDeduction extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare vacationDeductionId: number

  @column()
  declare employeeId: number

  @column()
  declare vacationSettingId: number

  @column()
  declare vacationDeductionDays: number

  @column()
  declare vacationDeductionDescription: string

  @column.dateTime({ autoCreate: true })
  declare vacationDeductionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare vacationDeductionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'vacation_deduction_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => VacationSetting, {
    foreignKey: 'vacationSettingId',
  })
  declare vacationSetting: BelongsTo<typeof VacationSetting>
}
