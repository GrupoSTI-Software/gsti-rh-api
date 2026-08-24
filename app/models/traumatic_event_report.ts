import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from '#models/employee'
import TraumaticEventType from '#models/traumatic_event_type'
import User from '#models/user'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
import { withSensitiveWriteGuard } from '#mixins/with_sensitive_write_guard'

export type TraumaticEventReportOrigin = 'employee' | 'rh'

/**
 * @swagger
 * components:
 *   schemas:
 *     TraumaticEventReport:
 *       type: object
 *       properties:
 *         traumaticEventReportId:
 *           type: integer
 *           description: Identificador único del reporte.
 *         employeeId:
 *           type: integer
 *           description: Empleado afectado (FK a employees).
 *         traumaticEventTypeId:
 *           type: integer
 *           description: Tipo de evento (FK a traumatic_event_types).
 *         traumaticEventReportOccurredAt:
 *           type: string
 *           format: date
 *           description: Fecha en que ocurrió el evento (YYYY-MM-DD).
 *         traumaticEventReportElaboratedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora en que se elaboró el reporte (asignada por el servidor).
 *         traumaticEventReportInvolvedPeople:
 *           type: string
 *           description: Personas involucradas en el evento.
 *         traumaticEventReportDescription:
 *           type: string
 *           description: Descripción del evento traumático.
 *         traumaticEventReportOrigin:
 *           type: string
 *           enum: [employee, rh]
 *           description: Canal de captura del reporte.
 *         traumaticEventReportCapturedByUserId:
 *           type: integer
 *           description: Usuario que registró el reporte (FK a users).
 *         traumaticEventReportCreatedAt:
 *           type: string
 *           format: date-time
 *         traumaticEventReportUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         traumaticEventReportDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class TraumaticEventReport extends compose(BaseModel, SoftDeletes, withSensitiveWriteGuard()) {
  static table = 'traumatic_event_reports'

  @column({ isPrimary: true })
  declare traumaticEventReportId: number

  @column()
  declare employeeId: number

  @column()
  declare traumaticEventTypeId: number

  @column.date()
  declare traumaticEventReportOccurredAt: DateTime

  @column.dateTime()
  declare traumaticEventReportElaboratedAt: DateTime

  /**
   * Personas involucradas en el ATS — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de salud sensible reforzado). No se usa en cláusulas WHERE de SQL.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serialize: sensitiveSerialize('TraumaticEventReport', 'traumaticEventReportInvolvedPeople'),
  })
  declare traumaticEventReportInvolvedPeople: string

  /**
   * Descripción del acontecimiento traumático severo — cifrada AES-256-CBC en reposo
   * (LFPDPPP art. 3.VI, dato de salud sensible reforzado). No se usa en WHERE de SQL.
   */
  @column({
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
    serialize: sensitiveSerialize('TraumaticEventReport', 'traumaticEventReportDescription'),
  })
  declare traumaticEventReportDescription: string

  @column()
  declare traumaticEventReportOrigin: TraumaticEventReportOrigin

  @column()
  declare traumaticEventReportCapturedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare traumaticEventReportCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare traumaticEventReportUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'traumatic_event_report_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => TraumaticEventType, { foreignKey: 'traumaticEventTypeId' })
  declare traumaticEventType: BelongsTo<typeof TraumaticEventType>

  @belongsTo(() => User, { foreignKey: 'traumaticEventReportCapturedByUserId' })
  declare capturedBy: BelongsTo<typeof User>
}
