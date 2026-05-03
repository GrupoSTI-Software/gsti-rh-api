import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeSalaryHistory:
 *        type: object
 *        properties:
 *          employeeSalaryHistoryId:
 *            type: number
 *            description: Identificador del registro del histórico
 *          employeeId:
 *            type: number
 *            description: Empleado al que corresponde el cambio (FK a employees)
 *          salaryDaily:
 *            type: number
 *            description: Salario diario vigente en este período (cifrado en BD)
 *          validFrom:
 *            type: string
 *            description: Inicio del período de vigencia
 *          validTo:
 *            type: string
 *            description: Fin del período de vigencia (null si es el vigente)
 *          changedBy:
 *            type: number
 *            description: Usuario que realizó el cambio (FK a users)
 *          reason:
 *            type: string
 *            description: Motivo opcional del cambio
 *          employeeSalaryHistoryCreatedAt:
 *            type: string
 *          employeeSalaryHistoryDeletedAt:
 *            type: string
 */
export default class EmployeeSalaryHistory extends compose(BaseModel, SoftDeletes) {
  static table = 'employee_salary_history'

  @column({ isPrimary: true })
  declare employeeSalaryHistoryId: number

  @column()
  declare employeeId: number

  /**
   * Salario diario — cifrado AES-256-CBC en reposo (LFPDPPP).
   * `prepare` cifra antes de persistir; `consume` descifra al leer desde BD.
   */
  @column({
    prepare: (value: number | string) => encryption.encrypt(String(value)),
    consume: (value: string) => {
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
  })
  declare salaryDaily: number

  @column.date()
  declare validFrom: DateTime

  @column.date()
  declare validTo: DateTime | null

  @column()
  declare changedBy: number

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true, columnName: 'employee_salary_history_created_at' })
  declare employeeSalaryHistoryCreatedAt: DateTime

  @column.dateTime({ columnName: 'employee_salary_history_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => User, {
    foreignKey: 'changedBy',
  })
  declare changedByUser: BelongsTo<typeof User>
}
