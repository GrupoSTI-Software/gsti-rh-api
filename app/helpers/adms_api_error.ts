import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import { ADMS_ERROR_CODES, type AdmsErrorCode } from '#constants/adms_error_codes'
import type { DeviceCommandErrorCode } from '#constants/device_command_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import { EmployeeOutOfScopeError } from '#modules/access-point/employee_business_unit'
import { AccessPointOutOfScopeError } from '#modules/access-point/access_point_out_of_scope_error'
import { DeviceBusyError } from '#modules/access-point/device_busy_error'
import { DeviceCommandError } from '#exceptions/device_command_error'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import type { BiometricVaultErrorCode } from '#constants/biometric_vault_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import type { PlatformDeviceErrorCode } from '#constants/platform_device_error_codes'

export interface ResolvedAdmsApiError {
  status: number
  title: string
  detail: string
  key: string
  code: AdmsErrorCode | DeviceCommandErrorCode | BiometricVaultErrorCode | PlatformDeviceErrorCode
}

/**
 * Forma unica del error de las rutas privadas del canal ADMS (spec 11): el
 * Backoffice ramifica por `key`, nunca por el texto de `detail`.
 * 400 validacion, 403 sin permiso, 404 fuera de alcance, 500 no clasificado.
 */
export function resolveAdmsApiError(error: unknown, i18n: I18n): ResolvedAdmsApiError {
  const err = error as { code?: string; messages?: Array<{ message?: string }> }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      status: 400,
      title: i18n.formatMessage('adms_val_input_title'),
      detail: err.messages?.[0]?.message ?? i18n.formatMessage('adms_val_input_message'),
      key: 'datos-invalidos',
      code: ADMS_ERROR_CODES.VAL_INPUT,
    }
  }

  /**
   * Los tres errores del tramo son el mismo contrato con distinto catálogo de
   * códigos: el Backoffice ramifica por `key` en todos los casos.
   */
  /**
   * El tramo de plataforma lanza su propio error, con la misma forma pero otro
   * catalogo. Sin esta rama, un 404 legitimo saldria como 500 y el operador
   * veria "error interno" donde en realidad tecleo mal un identificador.
   */
  if (error instanceof PlatformDeviceServiceError) {
    return {
      status: error.httpStatus,
      title: error.message,
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
    }
  }

  /**
   * Colaborador fuera del alcance: el mismo 404 venga de donde venga (no
   * existe, es de otra empresa o no tiene empresa), con texto i18n y sin datos
   * del colaborador.
   */
  if (error instanceof EmployeeOutOfScopeError) {
    return {
      status: 404,
      title: i18n.formatMessage('access_point_employee_employee_not_found_title'),
      detail: i18n.formatMessage('access_point_employee_employee_not_found_message'),
      key: 'colaborador-no-encontrado',
      code: ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    }
  }

  /** Otra operacion retiene el checador mas alla del tiempo de espera del candado. */
  if (error instanceof DeviceBusyError) {
    return {
      status: 409,
      title: i18n.formatMessage('access_point_device_busy_title'),
      detail: i18n.formatMessage('access_point_device_busy_message'),
      key: 'equipo-ocupado',
      code: ADMS_ERROR_CODES.SYS_INTERNAL,
    }
  }

  /** Checador fuera del alcance: el mismo 404 lo lance la autorizacion o la revalidacion. */
  if (error instanceof AccessPointOutOfScopeError) {
    return {
      status: 404,
      title: i18n.formatMessage('adms_not_found_title'),
      detail: i18n.formatMessage('adms_not_found_message'),
      key: 'punto-acceso-no-encontrado',
      code: ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    }
  }

  if (
    error instanceof AdmsError ||
    error instanceof DeviceCommandError ||
    error instanceof BiometricVaultError
  ) {
    return {
      status: error.httpStatus,
      title: error.message,
      detail: error.detail ?? error.message,
      key: error.key ?? 'error-adms',
      code: error.code,
    }
  }

  return {
    status: 500,
    title: i18n.formatMessage('adms_internal_title'),
    detail: i18n.formatMessage('adms_internal_message'),
    key: 'error-interno',
    code: ADMS_ERROR_CODES.SYS_INTERNAL,
  }
}

export function respondAdmsApiError(
  response: HttpContext['response'],
  i18n: I18n,
  error: unknown
) {
  const resolved = resolveAdmsApiError(error, i18n)
  return response.status(resolved.status).json({
    type: 'error',
    title: resolved.title,
    detail: resolved.detail,
    key: resolved.key,
    code: resolved.code,
  })
}
