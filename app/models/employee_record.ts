import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import Employee from './employee.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeRecord:
 *       type: object
 *       properties:
 *         employeeRecordId:
 *           type: number
 *           description: Employee record ID
 *         employeeRecordPropertyId:
 *           type: number
 *           nullable: true
 *           description: Employee record property id
 *         employeeId:
 *           type: number
 *           nullable: true
 *           description: Employee id
 *         employeeRecordValue:
 *           type: string
 *           nullable: true
 *           description: Employee record value
 *         employeeRecordActive:
 *           type: number
 *           nullable: true
 *           description: Employee record active
 *         employeeRecordCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee record was created
 *         employeeRecordUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee record was last updated
 *         employeeRecordDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the employee record was soft-deleted
 *       example:
 *         employeeRecordId: 1
 *         employeeRecordPropertyId: 1
 *         employeeId: 1
 *         employeeRecordValue: 'Ingles/Medio'
 *         employeeRecordActive: 1
 *         employeeRecordCreatedAt: '2025-02-12T12:00:00Z'
 *         employeeRecordUpdatedAt: '2025-02-12T13:00:00Z'
 *         employeeRecordDeletedAt: null
 */

export default class EmployeeRecord extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeRecordId: number

  @column()
  declare employeeRecordPropertyId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare employeeRecordValue: string

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeRecord) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare employeeRecordActive: number

  @column.dateTime({ autoCreate: true })
  declare employeeRecordCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeRecordUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_record_deleted_at' })
  declare deletedAt: DateTime | null
}
