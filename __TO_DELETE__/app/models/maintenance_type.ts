import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceType:
 *       type: object
 *       properties:
 *         maintenanceTypeId:
 *           type: number
 *           description: Maintenance Type Id
 *         maintenanceTypeName:
 *           type: string
 *           description: Maintenance Type Name
 *         maintenanceTypeDescription:
 *           type: string
 *           description: Maintenance Type Description
 *         maintenanceTypeCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         maintenanceTypeUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         maintenanceTypeDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class MaintenanceType extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare maintenanceTypeId: number

  @column({ columnName: 'maintenance_type_name' })
  declare maintenanceTypeName: string | null

  @column({ columnName: 'maintenance_type_description' })
  declare maintenanceTypeDescription: string | null

  @column.dateTime({ autoCreate: true, columnName: 'maintenance_type_created_at' })
  declare maintenanceTypeCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'maintenance_type_updated_at' })
  declare maintenanceTypeUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'maintenance_type_deleted_at' })
  declare deletedAt: DateTime | null
}
