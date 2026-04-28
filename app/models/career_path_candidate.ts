import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Position from './position.js'
import BusinessUnit from './business_unit.js'
import CareerPathOverrideReason from './career_path_override_reason.js'
import User from './user.js'
import CareerPathCandidateStatusHistory from './career_path_candidate_status_history.js'
import Employee from './employee.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     CareerPathCandidate:
 *       type: object
 *       properties:
 *         careerPathCandidateId:
 *           type: number
 *           description: Career path candidate ID
 *         businessUnitId:
 *           type: number
 *           description: Business unit ID
 *         employeeId:
 *           type: number
 *           description: Employee ID
 *         originPositionId:
 *           type: number
 *           description: Origin position ID
 *         targetPositionId:
 *           type: number
 *           description: Target position ID
 *         careerPathCandidateIsOverride:
 *           type: boolean
 *           description: Career path candidate is override
 *         careerPathOverrideReasonId:
 *           type: number
 *           description: Career path override reason ID
 *         careerPathCandidateJustification:
 *           type: string
 *           description: Career path candidate justification
 *         proposedBy:
 *           type: number
 *           description: Proposed by user ID
 *         careerPathCandidateStatus:
 *           type: string
 *           description: Career path candidate status
 *           enum:
 *             - propuesto
 *             - activo
 *             - rechazado
 *             - desactivado
 *             - expirado
 *         reviewedBy:
 *           type: number
 *           description: Reviewed by user ID
 *         careerPathCandidateReviewedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path candidate was reviewed
 *         careerPathCandidateRejectionReason:
 *           type: string
 *           description: Career path candidate rejection reason
 *         careerPathCandidateActivatedAt:
 *           type: string
 *           description: Date and time when the career path candidate was activated
 *         careerPathCandidateExpiresAt:
 *           type: string
 *           description: Date and time when the career path candidate expired
 *         careerPathCandidateCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path candidate was created
 *         careerPathCandidateUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path candidate was last updated
 *         careerPathCandidateDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the career path candidate was soft-deleted
 *       example:
 *         careerPathCandidateId: 1
 *         businessUnitId: 1
 *         employeeId: 1
 *         originPositionId: 1
 *         targetPositionId: 2
 *         careerPathCandidateIsOverride: true
 *         careerPathOverrideReasonId: 1
 *         careerPathCandidateJustification: 'Career path candidate justification'
 *         careerPathCandidateStatus: 'propuesto'
 *         proposedBy: 1
 *         reviewedBy: 1
 *         careerPathCandidateReviewedAt: '2025-02-06T12:00:00Z'
 *         careerPathCandidateRejectionReason: 'Career path candidate rejection reason'
 *         careerPathCandidateActivatedAt: '2025-02-06T12:00:00Z'
 *         careerPathCandidateExpiresAt: '2025-02-06T12:00:00Z'
 *         careerPathCandidateCreatedAt: '2025-02-06T12:00:00Z'
 *         careerPathCandidateUpdatedAt: '2025-02-06T13:00:00Z'
 *         careerPathCandidateDeletedAt: null
 *         careerPathTemplateCreatedAt: '2025-02-06T12:00:00Z'
 *         careerPathTemplateUpdatedAt: '2025-02-06T13:00:00Z'
 *         careerPathTemplateDeletedAt: null
 */

export default class CareerPathCandidate extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare careerPathCandidateId: number

  @column()
  declare businessUnitId: number

  @column()
  declare employeeId: number

  @column()
  declare originPositionId: number

  @column()
  declare targetPositionId: number

  @column()
  declare careerPathCandidateIsOverride: boolean

  @column()
  declare careerPathOverrideReasonId: number | null

  @column()
  declare careerPathCandidateJustification: string

  @column()
  declare careerPathCandidateStatus: string

  @column()
  declare proposedBy: number

  @column()
  declare reviewedBy: number | null

  @column()
  declare careerPathCandidateReviewedAt: DateTime | null | string

  @column()
  declare careerPathCandidateRejectionReason: string

  @column.dateTime()
  declare careerPathCandidateActivatedAt: DateTime

  @column.dateTime()
  declare careerPathCandidateExpiresAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare careerPathCandidateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare careerPathCandidateUpdatedAt: DateTime

  @column.dateTime({ columnName: 'career_path_candidate_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => Position, {
    foreignKey: 'originPositionId',
  })
  declare originPosition: BelongsTo<typeof Position>

  @belongsTo(() => Position, {
    foreignKey: 'targetPositionId',
  })
  declare targetPosition: BelongsTo<typeof Position>

  @belongsTo(() => CareerPathOverrideReason, {
    foreignKey: 'careerPathOverrideReasonId',
  })
  declare careerPathOverrideReason: BelongsTo<typeof CareerPathOverrideReason>

  @belongsTo(() => User, {
    foreignKey: 'proposedBy',
    onQuery: (query) => {
      query.preload('person')
    },
  })
  declare proposedByUser: BelongsTo<typeof User>

  @belongsTo(() => User, {
    foreignKey: 'reviewedBy',
  })
  declare reviewedByUser: BelongsTo<typeof User>

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.preload('person')
      query.preload('position')
    },
  })
  declare employee: BelongsTo<typeof Employee>

  @hasMany(() => CareerPathCandidateStatusHistory, {
    foreignKey: 'careerPathCandidateId',
    onQuery: (query) => {
      query.preload('changedByUser', (q) => {
        q.preload('person')
      })
    },
  })
  declare careerPathCandidateStatusHistories: HasMany<typeof CareerPathCandidateStatusHistory>
}
