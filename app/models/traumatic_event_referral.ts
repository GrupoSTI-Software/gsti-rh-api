import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TraumaticEventReport from '#models/traumatic_event_report'
import User from '#models/user'

export type TraumaticEventReferralInstitutionType =
  | 'imss'
  | 'company_doctor'
  | 'private_clinic'
  | 'other'

/**
 * @swagger
 * components:
 *   schemas:
 *     TraumaticEventReferral:
 *       type: object
 *       properties:
 *         traumaticEventReferralId:
 *           type: integer
 *           description: Identificador único de la canalización.
 *         traumaticEventReportId:
 *           type: integer
 *           description: Reporte de evento traumático padre (FK).
 *         traumaticEventReferralInstitutionType:
 *           type: string
 *           enum: [imss, company_doctor, private_clinic, other]
 *           description: Tipo de institución a la que se canalizó al trabajador.
 *         traumaticEventReferralInstitutionName:
 *           type: string
 *           description: Nombre de la institución (3-150).
 *         traumaticEventReferralReferredAt:
 *           type: string
 *           format: date
 *           description: Fecha de canalización (YYYY-MM-DD).
 *         traumaticEventReferralNotes:
 *           type: string
 *           nullable: true
 *           description: Observaciones (máx 500).
 *         traumaticEventReferralCapturedByUserId:
 *           type: integer
 *           description: Usuario que registró la canalización (FK a users, asignado por el servidor).
 *         traumaticEventReferralCreatedAt:
 *           type: string
 *           format: date-time
 *         traumaticEventReferralUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         traumaticEventReferralDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class TraumaticEventReferral extends compose(BaseModel, SoftDeletes) {
  static table = 'traumatic_event_referrals'

  @column({ isPrimary: true })
  declare traumaticEventReferralId: number

  @column()
  declare traumaticEventReportId: number

  @column()
  declare traumaticEventReferralInstitutionType: TraumaticEventReferralInstitutionType

  @column()
  declare traumaticEventReferralInstitutionName: string

  @column.date()
  declare traumaticEventReferralReferredAt: DateTime

  @column()
  declare traumaticEventReferralNotes: string | null

  @column()
  declare traumaticEventReferralCapturedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare traumaticEventReferralCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare traumaticEventReferralUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'traumatic_event_referral_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => TraumaticEventReport, { foreignKey: 'traumaticEventReportId' })
  declare report: BelongsTo<typeof TraumaticEventReport>

  @belongsTo(() => User, { foreignKey: 'traumaticEventReferralCapturedByUserId' })
  declare capturedBy: BelongsTo<typeof User>
}
