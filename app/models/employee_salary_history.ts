import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import encryption from '@adonisjs/core/services/encryption'
import Employee from './employee.js'
import User from './user.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'

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
 *          businessUnitId:
 *            type: number
 *            description: Unidad de negocio dueña (defensa en profundidad, USRH1783821206584)
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
export default class EmployeeSalaryHistory extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_salary_history'

  @column({ isPrimary: true })
  declare employeeSalaryHistoryId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1783821206584). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1783821206584). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeSalaryHistory) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

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
    serialize: sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily'),
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
