import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import AircraftMaintenance from './aircraft_maintenance.js'
import MaintenanceExpenseCategory from './maintenance_expense_category.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceExpense:
 *       type: object
 *       properties:
 *         maintenanceExpenseId:
 *           type: number
 *           description: Expense ID
 *         aircraftMaintenanceId:
 *           type: number
 *           description: Associated Aircraft Maintenance ID
 *         maintenanceExpenseCategoryId:
 *           type: number
 *           description: Expense Category ID
 *         maintenanceExpenseAmount:
 *           type: number
 *           format: float
 *           description: Amount spent
 *         maintenanceExpenseTicket:
 *           type: string
 *           description: Path to ticket (PDF/Image)
 *         maintenanceExpenseTrackingNumber:
 *           type: string
 *           description: Tracking number
 *         maintenanceExpenseInternalFolio:
 *           type: string
 *           format: uuid
 *           description: Internal folio (UUID)
 *         maintenanceExpenseCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         maintenanceExpenseUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         maintenanceExpenseDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class MaintenanceExpense extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare maintenanceExpenseId: number

  @column({ columnName: 'aircraft_maintenance_id' })
  declare aircraftMaintenanceId: number

  @column({ columnName: 'maintenance_expense_category_id' })
  declare maintenanceExpenseCategoryId: number

  @column({ columnName: 'maintenance_expense_amount' })
  declare maintenanceExpenseAmount: number

  @column({ columnName: 'maintenance_expense_ticket' })
  declare maintenanceExpenseTicket: string | null

  @column({ columnName: 'maintenance_expense_tracking_number' })
  declare maintenanceExpenseTrackingNumber: string

  @column({ columnName: 'maintenance_expense_internal_folio' })
  declare maintenanceExpenseInternalFolio: string

  @column.dateTime({ autoCreate: true, columnName: 'maintenance_expense_created_at' })
  declare maintenanceExpenseCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'maintenance_expense_updated_at' })
  declare maintenanceExpenseUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'maintenance_expense_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => AircraftMaintenance, {
    foreignKey: 'aircraftMaintenanceId',
  })
  declare aircraftMaintenance: BelongsTo<typeof AircraftMaintenance>

  @belongsTo(() => MaintenanceExpenseCategory, {
    foreignKey: 'maintenanceExpenseCategoryId',
  })
  declare maintenanceExpenseCategory: BelongsTo<typeof MaintenanceExpenseCategory>
}
