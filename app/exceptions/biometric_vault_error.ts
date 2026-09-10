import type { BiometricVaultErrorCode } from '#constants/biometric_vault_error_codes'

/**
 * Error de la boveda de biometricos. Misma forma que `AdmsError` y
 * `DeviceCommandError`: el Backoffice ramifica por `key`.
 */
export class BiometricVaultError extends Error {
  readonly code: BiometricVaultErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    code: BiometricVaultErrorCode,
    httpStatus: number = 422,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'BiometricVaultError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}
