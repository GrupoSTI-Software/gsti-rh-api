import type { SystemSettingResolutionErrorCode } from '../constants/system_setting_resolution_error_codes.js'

/**
 * Error de dominio de la resolución de System Settings por `business_unit_id`
 * (USRH1783712837584). Se lanza desde `SystemSettingService.resolveByBusinessUnitId()`,
 * la frontera única de reúso para los call-sites request-scoped (y, más
 * adelante, para los procesos batch de la historia hermana USRH1783713925140).
 *
 * Se alinea al estándar GSTI `{ title, detail, key, code }` en vez del
 * `{ status, type, title, message, data }` legado que usa el resto del área
 * de System Settings (decisión consciente, ver spec §7).
 */
export class SystemSettingResolutionError extends Error {
  readonly errorCode: SystemSettingResolutionErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: SystemSettingResolutionErrorCode,
    httpStatus: number = 404,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'SystemSettingResolutionError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}
