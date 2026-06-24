import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TraumaticEventReport from '#models/traumatic_event_report'
import User from '#models/user'

export type TraumaticEventExamType = 'medical' | 'psychological'
export type TraumaticEventExamOutcome = 'fit' | 'needs_follow_up' | 'referred'

/**
 * @swagger
 * components:
 *   schemas:
 *     TraumaticEventExam:
 *       type: object
 *       properties:
 *         traumaticEventExamId:
 *           type: integer
 *         traumaticEventReportId:
 *           type: integer
 *         traumaticEventExamType:
 *           type: string
 *           enum: [medical, psychological]
 *         traumaticEventExamPerformedAt:
 *           type: string
 *           format: date
 *         traumaticEventExamPerformedBy:
 *           type: string
 *           description: Nombre del profesional o institución (3-150).
 *         traumaticEventExamOutcome:
 *           type: string
 *           enum: [fit, needs_follow_up, referred]
 *         traumaticEventExamNotes:
 *           type: string
 *           nullable: true
 *           description: Nota libre del capturador (máx 500).
 *         traumaticEventExamCapturedByUserId:
 *           type: integer
 *           description: Usuario que registró el resultado (asignado por el servidor).
 *         traumaticEventExamCreatedAt:
 *           type: string
 *           format: date-time
 *         traumaticEventExamUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         traumaticEventExamDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class TraumaticEventExam extends compose(BaseModel, SoftDeletes) {
  static table = 'traumatic_event_exams'

  @column({ isPrimary: true })
  declare traumaticEventExamId: number

  @column()
  declare traumaticEventReportId: number

  @column()
  declare traumaticEventExamType: TraumaticEventExamType

  @column.date()
  declare traumaticEventExamPerformedAt: DateTime

  @column()
  declare traumaticEventExamPerformedBy: string

  @column()
  declare traumaticEventExamOutcome: TraumaticEventExamOutcome

  @column()
  declare traumaticEventExamNotes: string | null

  @column()
  declare traumaticEventExamCapturedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare traumaticEventExamCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare traumaticEventExamUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'traumatic_event_exam_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => TraumaticEventReport, { foreignKey: 'traumaticEventReportId' })
  declare report: BelongsTo<typeof TraumaticEventReport>

  @belongsTo(() => User, { foreignKey: 'traumaticEventExamCapturedByUserId' })
  declare capturedBy: BelongsTo<typeof User>
}
