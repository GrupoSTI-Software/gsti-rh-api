import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeBonus:
 *       type: object
 *       properties:
 *         employeeBonusId:
 *           type: number
 *           description: Identificador único de la bonificación
 *         employeeId:
 *           type: number
 *           description: Identificador del empleado
 *         employeeBonusConcept:
 *           type: string
 *           description: Concepto de la bonificación
 *         employeeBonusQuantity:
 *           type: number
 *           description: Cantidad de unidades
 *         employeeBonusUnitAmount:
 *           type: number
 *           description: Monto unitario
 *         employeeBonusTotal:
 *           type: number
 *           description: Total calculado (cantidad * monto unitario)
 *         employeeBonusAssignmentDate:
 *           type: string
 *           format: date
 *           description: Fecha de asignación
 *         employeeBonusPaymentDate:
 *           type: string
 *           format: date
 *           description: Fecha de pago
 *         employeeBonusCreatedAt:
 *           type: string
 *         employeeBonusUpdatedAt:
 *           type: string
 *         employeeBonusDeletedAt:
 *           type: string
 */
export default class EmployeeBonus extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeBonusId: number

  @column()
  declare employeeId: number

  @column()
  declare employeeBonusConcept: string

  @column()
  declare employeeBonusQuantity: number

  @column()
  declare employeeBonusUnitAmount: number

  @column()
  declare employeeBonusTotal: number

  @column.date()
  declare employeeBonusAssignmentDate: DateTime

  @column.date()
  declare employeeBonusPaymentDate: DateTime

  @column.dateTime({ autoCreate: true })
  declare employeeBonusCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBonusUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_bonus_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>
}
