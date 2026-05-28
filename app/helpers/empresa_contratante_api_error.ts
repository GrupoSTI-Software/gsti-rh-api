import type { I18n } from '@adonisjs/i18n'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import type { EmpresaContratanteErrorCode } from '../constants/empresa_contratante_error_codes.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import { rfcInvalidDetailMessage } from '../shared/validators/rfc.validator.js'

export type ResolvedEmpresaContratanteApiError = {
  message: string
  title: string
  status: number
  errorCode: EmpresaContratanteErrorCode
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Record<EmpresaContratanteErrorCode, string> = {
  [EMPRESA_CONTRATANTE_ERROR_CODES.VAL_INPUT]: 'empresa_contratante_val_input',
  [EMPRESA_CONTRATANTE_ERROR_CODES.RFC_INVALID]: 'empresa_contratante_rfc_invalid',
  [EMPRESA_CONTRATANTE_ERROR_CODES.RFC_DUPLICATE]: 'empresa_contratante_rfc_duplicate',
  [EMPRESA_CONTRATANTE_ERROR_CODES.NOT_FOUND]: 'empresa_contratante_not_found',
  [EMPRESA_CONTRATANTE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND]: 'empresa_contratante_business_unit_not_found',
  [EMPRESA_CONTRATANTE_ERROR_CODES.FORBIDDEN]: 'empresa_contratante_forbidden',
  [EMPRESA_CONTRATANTE_ERROR_CODES.SYS_UNHANDLED]: 'empresa_contratante_unexpected_error',
}

function resolveMessageKey(errorCode: EmpresaContratanteErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: EmpresaContratanteErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

function isRfcValidationFailure(error: unknown): boolean {
  const err = error as { messages?: Array<{ field?: string; rule?: string }> }
  if (!err?.messages?.length) return false
  return err.messages.some(
    (m) =>
      m.rule === 'rfc_sat' ||
      (m.field === 'rfc' && (m.rule === 'minLength' || m.rule === 'maxLength'))
  )
}

/**
 * Convierte excepciones del módulo en respuesta HTTP estable para el cliente.
 */
export function resolveEmpresaContratanteApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedEmpresaContratanteApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string; field?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    if (isRfcValidationFailure(error)) {
      const fallbackDetail = err.messages?.[0]?.message ?? rfcInvalidDetailMessage()
      const message = translate(
        i18n,
        'empresa_contratante_rfc_invalid_message',
        fallbackDetail
      )
      return {
        message,
        title: translate(i18n, 'empresa_contratante_rfc_invalid_title', 'RFC inválido'),
        status: 400,
        errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.RFC_INVALID,
        key: 'rfc-invalido',
        detail: message,
      }
    }

    const rawMessage =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: rawMessage,
      title: translate(i18n, 'empresa_contratante_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof EmpresaContratanteError) {
    const message = translate(i18n, resolveMessageKey(error.errorCode), error.message)
    return {
      message,
      title: translate(i18n, resolveTitleKey(error.errorCode), error.message),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: message,
    }
  }

  if (error instanceof RepseRegistrationError) {
    if (error.errorCode === REPSE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND) {
      const message = translate(
        i18n,
        'empresa_contratante_business_unit_not_found_message',
        error.message
      )
      return {
        message,
        title: translate(
          i18n,
          'empresa_contratante_business_unit_not_found_title',
          'Empresa no encontrada'
        ),
        status: error.httpStatus,
        errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        key: error.key,
        detail: message,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'empresa_contratante_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'empresa_contratante_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: EMPRESA_CONTRATANTE_ERROR_CODES.SYS_UNHANDLED,
  }
}
