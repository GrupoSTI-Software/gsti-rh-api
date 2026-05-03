import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import DepartmentPosition from './department_position.js'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      Department:
 *        type: object
 *        properties:
 *          departmentId:
 *            type: number
 *            description: Department id
 *          departmentSyncId:
 *            type: number
 *            description: Imported department id
 *          departmentCode:
 *            type: string
 *            description: Department code
 *          departmentName:
 *            type: string
 *            description: Department name
 *          departmentAlias:
 *            type: string
 *            description: Department alias
 *          departmentIsDefault:
 *            type: boolean
 *            description: If the department is the default
 *          departmentActive:
 *            type: number
 *            description: Status
 *          parentDepartmentId:
 *            type: number
 *            description: Related department id
 *          parentDepartmentSyncId:
 *            type: number
 *            description: Imported related department id
 *          companyId:
 *            type: number
 *            description: Company id
 *          businessUnitId:
 *            type: number
 *            description: Id from the business unit, default SAE
 *          departmentLastSynchronizationAt:
 *            type: string
 *            description: Last synchronization date
 *          departmentCreatedAt:
 *            type: string
 *          departmentUpdatedAt:
 *            type: string
 *          departmentDeletedAt:
 *            type: string
 *
 */
export default class Department extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare departmentId: number

  @column()
  declare departmentSyncId: number

  @column()
  declare departmentCode: string

  @column()
  declare departmentName: string

  @column()
  declare departmentAlias: string

  /** Lista de alias separados por comas (búsqueda y unicidad en organigrama). */
  @column({ columnName: 'department_aliases' })
  declare aliases: string | null

  @column()
  declare departmentIsDefault: boolean

  @column()
  declare departmentActive: number

  @column()
  declare parentDepartmentId: number | null

  @column()
  declare parentDepartmentSyncId: number

  @column()
  declare companyId: number

  @column()
  declare businessUnitId: number

  @column()
  declare departmentLastSynchronizationAt: Date

  @column.dateTime({ autoCreate: true })
  declare departmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare departmentUpdatedAt: DateTime

  @column.dateTime({ columnName: 'department_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Department, {
    foreignKey: 'parentDepartmentId',
  })
  declare parentDepartment: BelongsTo<typeof Department>

  @hasMany(() => Department, {
    foreignKey: 'parentDepartmentId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('subDepartments')
        query.preload('departmentsPositions')
      }
    },
  })
  declare subDepartments: HasMany<typeof Department>

  @hasMany(() => DepartmentPosition, {
    foreignKey: 'departmentId',
  })
  declare departmentsPositions: HasMany<typeof DepartmentPosition>

  @hasMany(() => Employee, {
    foreignKey: 'departmentId',
  })
  declare employees: HasMany<typeof Employee>

  /**
   * =============================================
   */

  @hasMany(() => DepartmentPosition, {
    foreignKey: 'departmentId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('position', (squery) => {
          squery.preload('positions', (pquery) => {
            pquery.preload('employees')
          })
          squery.preload('employees')
          squery.preload('parentPosition')
        })
      }
    },
  })
  declare departmentPositions: HasMany<typeof DepartmentPosition>

  @hasMany(() => Department, {
    foreignKey: 'parentDepartmentId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('departments')
        query.preload('departmentPositions')
        query.orderBy('departmentName', 'asc')
      }
    },
  })
  declare departments: HasMany<typeof Department>
}
