import type { DeviceCommandErrorCode } from '#constants/device_command_error_codes'

/**
 * Error del modulo de comandos hacia el checador. Espeja a `AdmsError`: el
 * Backoffice ramifica por `key`, nunca por el texto de `detail`.
 */
export class DeviceCommandError extends Error {
  readonly code: DeviceCommandErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    code: DeviceCommandErrorCode,
    httpStatus: number = 422,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'DeviceCommandError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}
