import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import { RetentionPolicyEvidenceType } from '#constants/retention_policy'

/**
 * @swagger
 * components:
 *   schemas:
 *     RetentionPolicy:
 *       type: object
 *       description: >
 *         NOM-035 evidence retention policy per business unit.
 *         Defines whether retention is active and for how many years evidence
 *         must be preserved. One policy per business unit.
 *       properties:
 *         retentionPolicyId:
 *           type: integer
 *           description: Unique policy identifier
 *         businessUnitId:
 *           type: integer
 *           description: Owner business unit (FK to business_units)
 *         retentionPolicyIsActive:
 *           type: boolean
 *           description: Feature flag — whether retention is active for this business unit
 *           example: false
 *         retentionPolicyRetentionYears:
 *           type: integer
 *           description: Years to retain evidence (legal minimum 1, default 4)
 *           example: 4
 *         retentionPolicyCoveredEvidenceTypes:
 *           type: array
 *           items:
 *             type: string
 *             enum:
 *               - questionnaire_application
 *               - traumatic_event_report
 *               - traumatic_event_referral
 *               - traumatic_event_exam
 *               - complaint
 *           description: NOM-035 evidence types covered by this policy
 *         retentionPolicyUpdatedByUserId:
 *           type: integer
 *           description: User who last modified the policy (FK to users)
 *         retentionPolicyCreatedAt:
 *           type: string
 *           format: date-time
 *         retentionPolicyUpdatedAt:
 *           type: string
 *           format: date-time
 *         retentionPolicyDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class RetentionPolicy extends compose(BaseModel, SoftDeletes) {
  static table = 'retention_policies'

  @column({ isPrimary: true })
  declare retentionPolicyId: number

  @column()
  declare businessUnitId: number

  @column()
  declare retentionPolicyIsActive: boolean

  @column()
  declare retentionPolicyRetentionYears: number

  @column({
    prepare: (value: RetentionPolicyEvidenceType[]) => JSON.stringify(value),
    consume: (value: string | RetentionPolicyEvidenceType[]) =>
      typeof value === 'string' ? (JSON.parse(value) as RetentionPolicyEvidenceType[]) : value,
  })
  declare retentionPolicyCoveredEvidenceTypes: RetentionPolicyEvidenceType[]

  @column({ serializeAs: null })
  declare retentionPolicyCreatedByUserId: number

  @column()
  declare retentionPolicyUpdatedByUserId: number

  @column.dateTime({ autoCreate: true })
  declare retentionPolicyCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare retentionPolicyUpdatedAt: DateTime

  @column.dateTime({ columnName: 'retention_policy_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => User, { foreignKey: 'retentionPolicyCreatedByUserId' })
  declare creator: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'retentionPolicyUpdatedByUserId' })
  declare lastEditor: BelongsTo<typeof User>
}
