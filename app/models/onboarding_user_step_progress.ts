import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import OnboardingStep from '#models/onboarding_step'
import User from '#models/user'

/**
 * Progreso de un paso de onboarding para un usuario.
 * Único por (user_id, onboarding_step_id): garantiza idempotencia en complete/skip.
 * No tiene soft delete: el historial se preserva aunque el paso se desactive.
 */
export default class OnboardingUserStepProgress extends BaseModel {
  static table = 'onboarding_user_step_progress'

  @column({ isPrimary: true })
  declare onboardingUserStepProgressId: number

  @column()
  declare userId: number

  @column()
  declare onboardingStepId: number

  @column()
  declare status: 'completed' | 'skipped'

  @column.dateTime({ columnName: 'marked_at' })
  declare markedAt: DateTime

  @column.dateTime({ autoCreate: true, columnName: 'onboarding_user_step_progress_created_at' })
  declare onboardingUserStepProgressCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'onboarding_user_step_progress_updated_at' })
  declare onboardingUserStepProgressUpdatedAt: DateTime | null

  @belongsTo(() => OnboardingStep, { foreignKey: 'onboardingStepId' })
  declare step: BelongsTo<typeof OnboardingStep>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}
