import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceExpenseCategory:
 *       type: object
 *       properties:
 *         maintenanceExpenseCategoryId:
 *           type: number
 *           description: Category ID
 *         maintenanceExpenseCategoryName:
 *           type: string
 *           description: Name of the expense category
 *         maintenanceExpenseCategoryDescription:
 *           type: string
 *           description: Description of the expense category
 *         maintenanceExpenseCategoryCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         maintenanceExpenseCategoryUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         maintenanceExpenseCategoryDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class MaintenanceExpenseCategory extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare maintenanceExpenseCategoryId: number

  @column({ columnName: 'maintenance_expense_category_name' })
  declare maintenanceExpenseCategoryName: string

  @column({ columnName: 'maintenance_expense_category_description' })
  declare maintenanceExpenseCategoryDescription: string | null

  @column.dateTime({ autoCreate: true, columnName: 'maintenance_expense_category_created_at' })
  declare maintenanceExpenseCategoryCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'maintenance_expense_category_updated_at' })
  declare maintenanceExpenseCategoryUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'maintenance_expense_category_deleted_at' })
  declare deletedAt: DateTime | null
}
