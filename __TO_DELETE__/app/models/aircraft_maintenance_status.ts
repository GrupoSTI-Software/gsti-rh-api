import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceType:
 *       type: object
 *       properties:
 *         aircraftMaintenanceStatusId:
 *           type: number
 *           description: Aircraft Maintenance Status ID
 *         aircraftMaintenanceStatusName:
 *           type: string
 *           description: Aircraft Maintenance Status Name
 *         aircraftMaintenanceStatusColor:
 *           type: string
 *           description: Aircraft Maintenance Status Color
 *         aircraftMaintenanceStatusBg:
 *           type: string
 *           description: Aircraft Maintenance Status Background
 *         aircraftMaintenanceStatusCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         aircraftMaintenanceStatusUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         aircraftMaintenanceStatusDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class AircraftMaintenanceStatus extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare aircraftMaintenanceStatusId: number

  @column({ columnName: 'aircraft_maintenance_status_name' })
  declare aircraftMaintenanceStatusName: string | null

  @column({ columnName: 'aircraft_maintenance_status_color' })
  declare aircraftMaintenanceStatusColor: string | null

  @column({ columnName: 'aircraft_maintenance_status_bg' })
  declare aircraftMaintenanceStatusBg: string | null

  @column.dateTime({ autoCreate: true, columnName: 'aircraft_maintenance_status_created_at' })
  declare aircraftMaintenanceStatusCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'aircraft_maintenance_status_updated_at' })
  declare aircraftMaintenanceStatusUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'aircraft_maintenance_status_deleted_at' })
  declare deletedAt: DateTime | null
}
