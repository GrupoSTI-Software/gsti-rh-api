export type PlatformConsentErrorKey =
  | 'filtros-de-aceptaciones-invalidos'
  | 'empresa-no-encontrada'
  | 'parametros-de-historial-invalidos'
  | 'aceptacion-no-encontrada'
  | 'no-fue-posible-revelar-la-evidencia'

export default class PlatformConsentError extends Error {
  readonly key: PlatformConsentErrorKey

  constructor(key: PlatformConsentErrorKey, message?: string) {
    super(message ?? key)
    this.name = 'PlatformConsentError'
    this.key = key
  }
}
