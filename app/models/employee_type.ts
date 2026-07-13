import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from './business_unit.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeType:
 *       type: object
 *       properties:
 *         employeeTypeId:
 *           type: number
 *           description: Employee type ID
 *         employeeTypeName:
 *           type: string
 *           description: Employee type name
 *         employeeTypeSlug:
 *           type: string
 *           description: Employee type slug
 *         businessUnitId:
 *           type: number
 *           description: Business unit ID
 *         employeeTypeCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeTypeUpdatedAt:
 *           type: string
 *           format: date-time
 *         employeeTypeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *       example:
 *         employeeTypeId: 1
 *         employeeTypeName: "Employee"
 *         employeeTypeSlug: "employee"
 *         businessUnitId: 1
 *         employeeTypeCreatedAt: '2024-12-05T12:00:00Z'
 *         employeeTypeUpdatedAt: '2024-12-05T13:00:00Z'
 *         employeeTypeDeletedAt: null
 */
export default class EmployeeType extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeTypeId: number

  @column()
  declare employeeTypeName: string

  @column()
  declare employeeTypeSlug: string

  @column()
  declare businessUnitId: number

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @column.dateTime({ autoCreate: true })
  declare employeeTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_type_deleted_at' })
  declare deletedAt: DateTime | null
}
