/**
 * Claves de error de dominio del motor de onboarding.
 * Cada clave mapea a un código HTTP en el controller.
 */
export type OnboardingErrorKey =
  | 'paso-de-onboarding-no-encontrado'
  | 'intencion-de-onboarding-invalida'
  | 'paso-de-onboarding-no-omitible'
  | 'status-de-onboarding-invalido'
  | 'siembra-demo-no-encontrada'
  | 'siembra-demo-unidad-invalida'
  | 'siembra-demo-limite-empleados'

export default class OnboardingError extends Error {
  readonly key: OnboardingErrorKey
  readonly title: string
  readonly detail: string

  constructor(key: OnboardingErrorKey, title: string, detail: string) {
    super(detail)
    this.name = 'OnboardingError'
    this.key = key
    this.title = title
    this.detail = detail
  }
}
