import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import MaintenanceType from './maintenance_type.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Aircraft from './aircraft.js'
import MaintenanceUrgencyLevel from './maintenance_urgency_level.js'
import AircraftMaintenanceStatus from './aircraft_maintenance_status.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     AircraftMaintenance:
 *       type: object
 *       properties:
 *         aircraftMaintenanceId:
 *           type: number
 *           description: Aircraft Maintenance ID
 *         aircraftId:
 *           type: number
 *           description: Aircraft ID
 *         maintenanceTypeId:
 *           type: number
 *           description: Maintenance Type ID
 *         aircraftMaintenanceStartDate:
 *           type: date-time
 *           description: Start date of the maintenance
 *         aircraftMaintenanceEndDate:
 *           type: date-time
 *           description: End date of the maintenance
 *         aircraftMaintenanceFinishDate:
 *           type: date-time
 *           description: Finish date of the maintenance
 *         maintenanceUrgencyLevelId:
 *           type: number
 *           description: Urgency Level ID
 *         aircraftMaintenanceStatusId:
 *           type: number
 *           description: Status ID
 *         aircraftMaintenanceNotes:
 *           type: string
 *           description: Notes
 *         aircraftMaintenanceCreatedAt:
 *           type: date-time
 *           description: Creation timestamp
 *         aircraftMaintenanceUpdatedAt:
 *           type: date-time
 *           description: Update timestamp
 *         aircraftMaintenanceDeletedAt:
 *           type: date-time
 *           description: Soft delete timestamp
 */
export default class AircraftMaintenance extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare aircraftMaintenanceId: number

  @column({ columnName: 'aircraft_id' })
  declare aircraftId: number

  @column({ columnName: 'maintenance_type_id' })
  declare maintenanceTypeId: number

  @column({ columnName: 'aircraft_maintenance_start_date' })
  declare aircraftMaintenanceStartDate: DateTime

  @column({ columnName: 'aircraft_maintenance_end_date' })
  declare aircraftMaintenanceEndDate: DateTime

  @column({ columnName: 'aircraft_maintenance_finish_date' })
  declare aircraftMaintenanceFinishDate: DateTime | null

  @column({ columnName: 'maintenance_urgency_level_id' })
  declare maintenanceUrgencyLevelId: number

  @column({ columnName: 'aircraft_maintenance_status_id' })
  declare aircraftMaintenanceStatusId: number

  @column({ columnName: 'aircraft_maintenance_notes' })
  declare aircraftMaintenanceNotes: string | null

  @column.dateTime({ autoCreate: true, columnName: 'aircraft_maintenance_created_at' })
  declare aircraftMaintenanceCreatedAt: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'aircraft_maintenance_updated_at' })
  declare aircraftMaintenanceUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'aircraft_maintenance_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => MaintenanceType, {
    foreignKey: 'maintenanceTypeId',
  })
  declare maintenanceType: BelongsTo<typeof MaintenanceType>

  @belongsTo(() => Aircraft, {
    foreignKey: 'aircraftId',
  })
  declare aircraft: BelongsTo<typeof Aircraft>

  @belongsTo(() => MaintenanceUrgencyLevel, {
    foreignKey: 'maintenanceUrgencyLevelId',
  })
  declare maintenanceUrgencyLevel: BelongsTo<typeof MaintenanceUrgencyLevel>

  @belongsTo(() => AircraftMaintenanceStatus, {
    foreignKey: 'aircraftMaintenanceStatusId',
  })
  declare aircraftMaintenanceStatus: BelongsTo<typeof AircraftMaintenanceStatus>
}
