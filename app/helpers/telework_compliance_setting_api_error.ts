import type { I18n } from '@adonisjs/i18n'
import {
  TELEWORK_COMPLIANCE_SETTING_ERROR_CODES,
  type TeleworkComplianceSettingErrorCode,
} from '#constants/telework_compliance_setting_error_codes'
import { TeleworkComplianceSettingServiceError } from '#exceptions/telework_compliance_setting_service_error'

/**
 * Resolvedor de errores HTTP de los ajustes de teletrabajo
 * (VLRH-H1791306074375).
 *
 * Espejo de `retention_policy_api_error.ts` con dos desvíos: el error de
 * validación de Vine (`E_VALIDATION_ERROR`) responde **422** con `TWS.VAL.001`
 * y `key 'entrada-invalida'` (no el 400 del molde); y el error de dominio
 * propaga el `field` (nombre del campo del body) para que el controlador pinte
 * `data: { field }`.
 */
export type ResolvedTeleworkComplianceSettingError = {
  message: string
  title: string
  status: number
  errorCode: TeleworkComplianceSettingErrorCode | string
  key?: string
  detail?: string
  field?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

/**
 * Título de la respuesta por código de error (catálogo de la HU, §11).
 * `key` = slug kebab de este título. Estos rótulos son del contrato del API
 * (`TWS.*`), no del bloque i18n `telework_settings` (que solo trae el título
 * del módulo y los textos de mensaje).
 */
const ERROR_TITLE_BY_CODE: Record<TeleworkComplianceSettingErrorCode, string> = {
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.VAL_INPUT]: 'Entrada inválida',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_REVALIDATION_MONTHS]:
    'Periodicidad de revalidación inválida',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_NOTICE_DAYS]: 'Ventana de aviso inválida',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_ALLOWANCE]: 'Monto inválido',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.FORBIDDEN]: 'Sin permiso',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.UNRESOLVED_SCOPE]: 'Alcance no resuelto',
  [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.SYS_UNHANDLED]: 'Error inesperado',
}

/** Traduce la clave i18n del dominio; sin `messageKey` cae al mapa por código. */
function resolveMessageKey(error: TeleworkComplianceSettingServiceError): string | undefined {
  if (error.messageKey) return error.messageKey

  const byErrorCode: Partial<Record<TeleworkComplianceSettingErrorCode, string>> = {
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.VAL_INPUT]: 'telework_settings.val_input',
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_REVALIDATION_MONTHS]:
      'telework_settings.invalid_revalidation',
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_NOTICE_DAYS]: 'telework_settings.invalid_notice',
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.INVALID_ALLOWANCE]: 'telework_settings.invalid_allowance',
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.UNRESOLVED_SCOPE]: 'telework_settings.forbidden_scope',
    [TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.SYS_UNHANDLED]:
      'an_unexpected_error_has_occurred_on_the_server',
  }

  return byErrorCode[error.errorCode]
}

export function resolveTeleworkComplianceSettingApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedTeleworkComplianceSettingError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const message =
      err.messages?.[0]?.message ??
      translate(i18n, 'telework_settings.val_input', 'Los datos enviados no son válidos.')
    return {
      message,
      title: ERROR_TITLE_BY_CODE[TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.VAL_INPUT],
      status: 422,
      errorCode: TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.VAL_INPUT,
      key: 'entrada-invalida',
      detail: message,
    }
  }

  if (error instanceof TeleworkComplianceSettingServiceError) {
    const messageKey = resolveMessageKey(error)
    const message = messageKey ? translate(i18n, messageKey, error.message) : error.message
    return {
      message,
      title: ERROR_TITLE_BY_CODE[error.errorCode],
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      // El `detail` nombra el campo del body cuando el error de validación lo trae
      // (CA-7); si no, cae al texto de dominio (espejo del molde).
      detail: error.detail ?? (error.field ? `${error.field}: ${message}` : message),
      field: error.field,
    }
  }

  // Rama no tipada (500). No propaga el texto crudo del error interno (ni el
  // mensaje del driver ni el stack): usa el mensaje genérico del módulo, igual
  // que las demás ramas del resolvedor. El catálogo (§11) fija `TWS.SYS.001`
  // → título "Error inesperado" con `key` `error-inesperado`, presente también
  // en el `detail` para que el cuerpo nunca serialice `undefined`.
  const message = translate(
    i18n,
    'an_unexpected_error_has_occurred_on_the_server',
    'Ha ocurrido un error inesperado en el servidor'
  )
  return {
    message,
    title: ERROR_TITLE_BY_CODE[TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.SYS_UNHANDLED],
    status: fallbackStatus,
    errorCode: TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.SYS_UNHANDLED,
    key: 'error-inesperado',
    detail: message,
  }
}
