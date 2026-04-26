import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
/**
 * @swagger
 * components:
 *   schemas:
 *     CareerPathOverrideReason:
 *       type: object
 *       properties:
 *         careerPathOverrideReasonId:
 *           type: number
 *           description: Career path override reason ID
 *         careerPathOverrideReasonKey:
 *           type: string
 *           description: Career path override reason key
 *         careerPathOverrideReasonLabel:
 *           type: string
 *           description: Career path override reason label
 *         careerPathOverrideReasonActive:
 *           type: number
 *           description: Career path override reason active
 *         careerPathOverrideReasonCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path override reason was created
 *         careerPathOverrideReasonUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path override reason was last updated
 *         careerPathOverrideReasonDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the career path override reason was soft-deleted
 *       example:
 *         careerPathOverrideReasonId: 1
 *         careerPathOverrideReasonKey: 'career_path_override_reason_key'
 *         careerPathOverrideReasonLabel: 'career_path_override_reason_label'
 *         careerPathOverrideReasonActive: 1
 *         careerPathOverrideReasonCreatedAt: '2025-02-06T12:00:00Z'
 *         careerPathOverrideReasonUpdatedAt: '2025-02-06T13:00:00Z'
 *         careerPathOverrideReasonDeletedAt: null
 */
export default class CareerPathOverrideReason extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare careerPathOverrideReasonId: number

  @column()
  declare careerPathOverrideReasonKey: string

  @column()
  declare careerPathOverrideReasonLabel: string

  @column()
  declare careerPathOverrideReasonActive: number

  @column.dateTime({ autoCreate: true })
  declare careerPathOverrideReasonCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare careerPathOverrideReasonUpdatedAt: DateTime

  @column.dateTime({ columnName: 'career_path_override_reason_deleted_at' })
  declare deletedAt: DateTime | null
}
