import type { OnboardingErrorKey } from '#exceptions/onboarding_error'

/** Slugs de las intenciones sembradas en el seeder; se usan en tests y validadores. */
export const ONBOARDING_FLOW_SLUGS = ['attendance', 'vacations', 'records'] as const
export type OnboardingFlowSlug = (typeof ONBOARDING_FLOW_SLUGS)[number]

/** Estados posibles del onboarding global del usuario. */
export const ONBOARDING_USER_STATE_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'dismissed',
] as const
export type OnboardingUserStateStatus = (typeof ONBOARDING_USER_STATE_STATUSES)[number]

/** Valores aceptados por PUT /me/status. */
export const ONBOARDING_TERMINAL_STATUSES = ['dismissed', 'completed'] as const
export type OnboardingTerminalStatus = (typeof ONBOARDING_TERMINAL_STATUSES)[number]

/** Estados del progreso por paso. */
export const ONBOARDING_STEP_PROGRESS_STATUSES = ['completed', 'skipped'] as const
export type OnboardingStepProgressStatus = (typeof ONBOARDING_STEP_PROGRESS_STATUSES)[number]

/** Mapeo de clave de error → código HTTP para el controller. */
export const ONBOARDING_ERROR_STATUS: Record<OnboardingErrorKey, number> = {
  'paso-de-onboarding-no-encontrado': 404,
  'intencion-de-onboarding-invalida': 422,
  'paso-de-onboarding-no-omitible': 409,
  'status-de-onboarding-invalido': 422,
  'siembra-demo-no-encontrada': 404,
  'siembra-demo-unidad-invalida': 409,
  'siembra-demo-limite-empleados': 409,
}

/**
 * Tipos de entidad que la siembra demo registra pieza por pieza en
 * `onboarding_seeded_records` (USRH1785438246847). Constante de aplicación,
 * no enum de BD: el borrado (USRH1785438246903) itera sobre esta unión.
 */
export const ONBOARDING_SEEDED_ENTITY_TYPES = [
  'department',
  'position',
  'department_position',
  'person',
  'employee',
  'user',
  'shift',
  'employee_shift',
  'assist',
  'shift_exception',
  'exception_request',
] as const
export type OnboardingSeededEntityType = (typeof ONBOARDING_SEEDED_ENTITY_TYPES)[number]
