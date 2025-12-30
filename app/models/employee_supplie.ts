import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { belongsTo } from '@adonisjs/lucid/orm'
import Employee from './employee.js'
import Supply from './supplie.js'
import EmployeeSuppliesResponseContract from './employee_supplies_response_contract.js'
import * as relations from '@adonisjs/lucid/types/relations'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeSupplie:
 *       type: object
 *       properties:
 *         employeeSupplyId:
 *           type: number
 *           description: Employee supply ID
 *         employeeId:
 *           type: number
 *           description: Employee ID
 *         supplyId:
 *           type: number
 *           description: Supply ID
 *         employeeSupplyStatus:
 *           type: string
 *           description: Employee supply status
 *         employeeSupplyRetirementReason:
 *           type: string
 *           description: Employee supply retirement reason
 *         employeeSupplyRetirementDate:
 *           type: string
 *           format: date-time
 *           description: Employee supply retirement date
 *         employeeSupplyExpirationDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Employee supply expiration date (optional)
 *         employeeSupplyCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee supply was created
 *         employeeSupplyUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the employee supply was last updated
 *         employeeSupplyDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the employee supply was soft-deleted
 *       example:
 *         employeeSupplyId: 1
 *         employeeId: 1
 *         supplyId: 1
 *         employeeSupplyStatus: 'active'
 *         employeeSupplyRetirementReason: 'Lost'
 *         employeeSupplyRetirementDate: '2025-02-12T12:00:00Z'
 *         employeeSupplyExpirationDate: '2026-02-12T12:00:00Z'
 *         employeeSupplyCreatedAt: '2025-02-12T12:00:00Z'
 *         employeeSupplyUpdatedAt: '2025-02-12T13:00:00Z'
 *         employeeSupplyDeletedAt: null
 *         employee:
 *           # Example employee object
 *         supply:
 *           # Example supply object
 */
export default class EmployeeSupplie extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare employeeSupplyId: number

  @column()
  declare employeeId: number

  @column()
  declare supplyId: number

  @column()
  declare employeeSupplyStatus: 'active' | 'retired' | 'shipping'

  @column()
  declare employeeSupplyRetirementReason: string | null

  @column.dateTime()
  declare employeeSupplyRetirementDate: DateTime | null

  @column.dateTime()
  declare employeeSupplyExpirationDate: DateTime | null

  @column()
  declare employeeSupplyAdditions: string | null

  @column.dateTime()
  declare employeeSupplyAssignamentDate: DateTime

  @column.dateTime({ autoCreate: true })
  declare employeeSupplyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeSupplyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_supply_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare employee: relations.BelongsTo<typeof Employee>

  @belongsTo(() => Supply, {
    foreignKey: 'supplyId',
    onQuery: (query) => {
      query.whereNull('supply_deleted_at')
    },
  })
  declare supply: relations.BelongsTo<typeof Supply>

  @hasMany(() => EmployeeSuppliesResponseContract, {
    foreignKey: 'employeeSupplyId',
  })
  declare responseContracts: relations.HasMany<typeof EmployeeSuppliesResponseContract>
}
