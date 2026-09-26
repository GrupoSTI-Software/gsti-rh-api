import type OnboardingUserState from '#models/onboarding_user_state'
import type OnboardingUserStepProgress from '#models/onboarding_user_step_progress'

/**
 * Contrato del repositorio del estado de onboarding por usuario.
 * Aísla el acceso a datos de la lógica de negocio del service.
 */
export interface StateRepository {
  /**
   * Encuentra el estado de onboarding del usuario o lo crea en status "pending"
   * si todavía no existe. No muta datos en lecturas posteriores.
   */
  findOrCreateUserState(userId: number): Promise<OnboardingUserState>

  /** Aplica cambios a un estado existente y lo persiste. */
  updateUserState(
    state: OnboardingUserState,
    attributes: Partial<OnboardingUserState>
  ): Promise<OnboardingUserState>

  /**
   * Upsert idempotente del progreso de un paso para un usuario.
   * La unicidad (user_id, onboarding_step_id) garantiza que el reenvío
   * del mismo POST no duplica filas.
   */
  upsertStepProgress(
    userId: number,
    stepId: number,
    status: 'completed' | 'skipped'
  ): Promise<OnboardingUserStepProgress>

  /** Lista todo el progreso de pasos de un usuario (solo las filas existentes). */
  listStepProgressForUser(userId: number): Promise<OnboardingUserStepProgress[]>
}
