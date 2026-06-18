export type ConsentErrorKey = 'version-de-consentimiento-invalida'

/**
 * Error de dominio del módulo de consentimiento.
 * Permite que el controller mapee al HTTP status correcto sin lógica condicional.
 */
export default class ConsentError extends Error {
  readonly key: ConsentErrorKey

  constructor(key: ConsentErrorKey, message: string) {
    super(message)
    this.name = 'ConsentError'
    this.key = key
  }
}
