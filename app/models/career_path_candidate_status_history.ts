import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import User from './user.js'
import CareerPathCandidate from './career_path_candidate.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
/**
 * @swagger
 * components:
 *   schemas:
 *     CareerPathCandidateStatusHistory:
 *       type: object
 *       properties:
 *         careerPathCandidateStatusHistoryId:
 *           type: number
 *           description: Career path candidate status history ID
 *         careerPathCandidateId:
 *           type: number
 *           description: Career path candidate ID
 *         businessUnitId:
 *           type: number
 *           description: >
 *             Marca de pertenencia propia (USRH1786648600061), heredada de la
 *             propuesta padre. Histórica y fija: no se recalcula si el
 *             candidato o el empleado cambian de empresa después.
 *         changedBy:
 *           type: number
 *           description: Changed by user ID
 *         careerPathCandidateStatusHistoryFromStatus:
 *           type: string
 *           description: Career path candidate status history from status
 *           enum:
 *             - propuesto
 *             - activo
 *             - rechazado
 *             - desactivado
 *             - expirado
 *         careerPathCandidateStatusHistoryToStatus:
 *           type: string
 *           description: Career path candidate status history to status
 *           enum:
 *             - propuesto
 *             - activo
 *             - rechazado
 *             - desactivado
 *             - expirado
 *         careerPathCandidateStatusHistoryReason:
 *           type: string
 *           description: Career path candidate status history reason
 *         careerPathCandidateStatusHistoryCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path candidate status history was created
 *         careerPathCandidateStatusHistoryUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path candidate status history was last updated
 *         careerPathCandidateStatusHistoryDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the career path candidate status history was soft-deleted
 *       example:
 *         careerPathCandidateStatusHistoryId: 1
 *         careerPathCandidateId: 1
 *         businessUnitId: 1
 *         changedBy: 1
 *         careerPathCandidateStatusHistoryFromStatus: 'propuesto'
 *         careerPathCandidateStatusHistoryToStatus: 'activo'
 *         careerPathCandidateStatusHistoryReason: 'Career path candidate status history reason'
 *         careerPathCandidateStatusHistoryCreatedAt: '2025-02-06T12:00:00Z'
 *         careerPathCandidateStatusHistoryUpdatedAt: '2025-02-06T13:00:00Z'
 *         careerPathCandidateStatusHistoryDeletedAt: null
 */
export default class CareerPathCandidateStatusHistory extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare careerPathCandidateStatusHistoryId: number

  @column()
  declare careerPathCandidateId: number

  /** Marca de pertenencia propia (hereda de la propuesta padre, USRH1786648600061). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la propuesta padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: CareerPathCandidateStatusHistory) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () =>
        CareerPathCandidate.query()
          .where('careerPathCandidateId', instance.careerPathCandidateId)
          .first(),
      'el candidato'
    )
  }

  @column()
  declare changedBy: number

  @column()
  declare careerPathCandidateStatusHistoryFromStatus: string | null

  @column()
  declare careerPathCandidateStatusHistoryToStatus: string

  @column()
  declare careerPathCandidateStatusHistoryReason: string

  @column.dateTime({ autoCreate: true })
  declare careerPathCandidateStatusHistoryCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare careerPathCandidateStatusHistoryUpdatedAt: DateTime

  @column.dateTime({ columnName: 'career_path_candidate_status_history_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, {
    foreignKey: 'changedBy',
  })
  declare changedByUser: BelongsTo<typeof User>
}