import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceUrgencyLevel:
 *       type: object
 *       properties:
 *         MaintenanceUrgencyLevelId:
 *           type: number
 *           description:  Maintenance Urgency Level ID
 *         MaintenanceUrgencyLevelName:
 *           type: string
 *           description:  Maintenance Urgency Level Name
 *         MaintenanceUrgencyLevelDescription:
 *           type: string
 *           description:  Maintenance Urgency Level Description
 *         MaintenanceUrgencyLevelCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         MaintenanceUrgencyLevelColor:
 *           type: string
 *           description:  Maintenance Urgency Level Color
 *         MaintenanceUrgencyLevelBg:
 *           type: string
 *           description:  Maintenance Urgency Level Background
 *         MaintenanceUrgencyLevelUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         MaintenanceUrgencyLevelDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class MaintenanceUrgencyLevel extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare maintenanceUrgencyLevelId: number

  @column({ columnName: 'maintenance_urgency_level_name' })
  declare maintenanceUrgencyLevelName: string | null

  @column({ columnName: 'maintenance_urgency_level_description' })
  declare maintenanceUrgencyLevelDescription: string | null

  @column({ columnName: 'maintenance_urgency_level_color' })
  declare maintenanceUrgencyLevelColor: string | null

  @column({ columnName: 'maintenance_urgency_level_bg' })
  declare maintenanceUrgencyLevelBg: string | null

  @column.dateTime({
    autoCreate: true,
    columnName: 'maintenance_urgency_level_created_at',
  })
  declare maintenanceUrgencyLevelCreatedAt: DateTime

  @column.dateTime({
    autoUpdate: true,
    columnName: 'maintenance_urgency_level_updated_at',
  })
  declare maintenanceUrgencyLevelUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'maintenance_urgency_level_deleted_at' })
  declare deletedAt: DateTime | null
}
