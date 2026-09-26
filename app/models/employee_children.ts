/* eslint-disable max-len */
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import { DateTime } from 'luxon'
import Employee from './employee.js'
/**
 * @swagger
 * components:
 *   schemas:
 *      EmployeeChildren:
 *        type: object
 *        properties:
 *          employeeChildrenId:
 *            type: number
 *            description: Employee children id
 *          employeeChildrenFirstname:
 *            type: string
 *            description: Employee children firstname
 *          employeeChildrenLastname:
 *            type: string
 *            description: Employee children lastname
 *          employeeChildrenSecondLastname:
 *            type: string
 *            description: Employee children second lastname
 *          employeeChildrenGender:
 *            type: string
 *            description: Employee children gender
 *          employeeChildrenBirthday:
 *            type: string
 *            description: Employee children birthday (YYYY-MM-DD)
 *          employeeId:
 *            type: number
 *            description: Employee id
 *          employeeChildrenCreatedAt:
 *            type: string
 *          employeeChildrenUpdatedAt:
 *            type: string
 *          employeeChildrenDeletedAt:
 *            type: string
 *
 */

export default class EmployeeChildren extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeChildrenId: number

  @column()
  declare employeeChildrenFirstname: string

  @column()
  declare employeeChildrenLastname: string

  @column()
  declare employeeChildrenSecondLastname: string

  @column()
  declare employeeChildrenGender: string

  @column()
  declare employeeChildrenBirthday: string

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeChildren) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeChildrenCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeChildrenUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_children_deleted_at' })
  declare deletedAt: DateTime | null
}
