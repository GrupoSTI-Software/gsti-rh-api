import type { RolePresetErrorCode } from '../constants/role_preset_error_codes.js'

/**
 * Error de dominio de las plantillas de rol con código HTTP y payload estable.
 */
export class RolePresetServiceError extends Error {
  readonly code: RolePresetErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly title?: string
  readonly detail?: string
  readonly data?: Record<string, unknown>

  constructor(
    message: string,
    code: RolePresetErrorCode,
    httpStatus: number = 400,
    key?: string,
    title?: string,
    detail?: string,
    data?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'RolePresetServiceError'
    this.code = code
    this.httpStatus = httpStatus
    this.key = key
    this.title = title
    this.detail = detail
    this.data = data
  }
}
