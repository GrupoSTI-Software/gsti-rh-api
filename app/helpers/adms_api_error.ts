import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import { ADMS_ERROR_CODES, type AdmsErrorCode } from '#constants/adms_error_codes'
import type { DeviceCommandErrorCode } from '#constants/device_command_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import { DeviceCommandError } from '#exceptions/device_command_error'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import type { BiometricVaultErrorCode } from '#constants/biometric_vault_error_codes'

export interface ResolvedAdmsApiError {
  status: number
  title: string
  detail: string
  key: string
  code: AdmsErrorCode | DeviceCommandErrorCode | BiometricVaultErrorCode
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
