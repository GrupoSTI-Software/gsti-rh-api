import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import OnboardingFlow from '#models/onboarding_flow'
import User from '#models/user'

/**
 * Estado de onboarding de un usuario. Uno por usuario (unique user_id).
 * Nace en pending; se llena por los endpoints de onboarding.
 * No tiene soft delete: el estado se termina lógicamente con status dismissed/completed.
 */
export default class OnboardingUserState extends BaseModel {
  static table = 'onboarding_user_states'

  @column({ isPrimary: true })
  declare onboardingUserStateId: number

  @column()
  declare userId: number

  /** FK a la intención elegida (null hasta que el usuario elige). */
  @column()
  declare onboardingFlowId: number | null

  /** Slug desnormalizado de la intención para lectura rápida sin join. */
  @column()
  declare onboardingUserStateIntentSlug: string | null

  @column()
  declare onboardingUserStateStatus: 'pending' | 'in_progress' | 'completed' | 'dismissed'

  @column.dateTime({ columnName: 'started_at' })
  declare startedAt: DateTime | null

  @column.dateTime({ columnName: 'completed_at' })
  declare completedAt: DateTime | null

  /**
   * Marcas de la siembra demo (USRH1785438246847). Siembra activa :=
   * demoSeededAt NOT NULL y demoCleanedAt NULL. La limpieza
   * (USRH1785438246903) marca demoCleanedAt; una re-siembra posterior
   * resetea ambas.
   */
  @column.dateTime({ columnName: 'onboarding_user_state_demo_seeded_at' })
  declare demoSeededAt: DateTime | null

  @column.dateTime({ columnName: 'onboarding_user_state_demo_cleaned_at' })
  declare demoCleanedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'onboarding_user_state_created_at' })
  declare onboardingUserStateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'onboarding_user_state_updated_at' })
  declare onboardingUserStateUpdatedAt: DateTime | null

  @belongsTo(() => OnboardingFlow, { foreignKey: 'onboardingFlowId' })
  declare flow: BelongsTo<typeof OnboardingFlow>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}
