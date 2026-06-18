/** Intención disponible expuesta en la respuesta de GET /me. */
export interface AvailableIntentDto {
  slug: string
  name: string
  order: number
}

/** Paso aplicable con su avance, expuesto en la respuesta de GET /me. */
export interface ApplicableStepDto {
  slug: string
  name: string
  /** null para pasos comunes; slug del flujo para pasos de rama. */
  flowSlug: string | null
  order: number
  skippable: boolean
  completionHint: string | null
  progress: 'pending' | 'completed' | 'skipped'
}

/** Panorama completo del onboarding de un usuario; shape de todas las respuestas 200. */
export interface OnboardingMeDto {
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed'
  intent: string | null
  availableIntents: AvailableIntentDto[]
  steps: ApplicableStepDto[]
}

/**
 * Tipo interno del service de resolución: incluye stepId para que
 * state.service pueda hacer upsert sin una segunda consulta a la BD.
 */
export interface ResolvedStepInternal extends ApplicableStepDto {
  stepId: number
}
