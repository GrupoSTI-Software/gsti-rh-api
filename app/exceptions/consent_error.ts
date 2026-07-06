import { CONSENT_ERROR_CODES } from '#constants/consent_error_codes'
import type { ConsentErrorCode } from '#constants/consent_error_codes'

export type ConsentErrorKey = 'version-de-consentimiento-invalida' | 'tipo-de-documento-invalido'

/**
 * Error de dominio del módulo de consentimiento.
 * Permite que el controller mapee al HTTP status correcto sin lógica condicional.
 *
 * `code` es el identificador estable `MOD.TYPE.NNN` para el cliente (ver
 * `consent_error_codes.ts`); `key` sigue siendo la clave i18n kebab-case existente.
 */
export default class ConsentError extends Error {
  readonly key: ConsentErrorKey
  readonly code: ConsentErrorCode

  constructor(key: ConsentErrorKey, message: string, code?: ConsentErrorCode) {
    super(message)
    this.name = 'ConsentError'
    this.key = key
    this.code = code ?? CONSENT_ERROR_CODES.INVALID_VERSION
  }
}
