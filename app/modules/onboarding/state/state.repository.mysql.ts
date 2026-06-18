import { DateTime } from 'luxon'
import OnboardingUserState from '#models/onboarding_user_state'
import OnboardingUserStepProgress from '#models/onboarding_user_step_progress'
import type { StateRepository } from './state.repository.js'

/** Implementación Lucid/MySQL del repositorio del estado de onboarding. */
export default class StateRepositoryMysql implements StateRepository {
  async findOrCreateUserState(userId: number): Promise<OnboardingUserState> {
    return OnboardingUserState.firstOrCreate(
      { userId },
      {
        onboardingFlowId: null,
        onboardingUserStateIntentSlug: null,
        onboardingUserStateStatus: 'pending',
        startedAt: null,
        completedAt: null,
      }
    )
  }

  async updateUserState(
    state: OnboardingUserState,
    attributes: Partial<OnboardingUserState>
  ): Promise<OnboardingUserState> {
    state.merge(attributes)
    await state.save()
    return state
  }

  async upsertStepProgress(
    userId: number,
    stepId: number,
    status: 'completed' | 'skipped'
  ): Promise<OnboardingUserStepProgress> {
    return OnboardingUserStepProgress.updateOrCreate(
      { userId, onboardingStepId: stepId },
      { status, markedAt: DateTime.now() }
    )
  }

  async listStepProgressForUser(userId: number): Promise<OnboardingUserStepProgress[]> {
    return OnboardingUserStepProgress.query().where('user_id', userId)
  }
}
