export type PlatformConsentErrorKey = 'filtros-de-aceptaciones-invalidos'

export default class PlatformConsentError extends Error {
  readonly key: PlatformConsentErrorKey

  constructor(key: PlatformConsentErrorKey, message?: string) {
    super(message ?? key)
    this.name = 'PlatformConsentError'
    this.key = key
  }
}
