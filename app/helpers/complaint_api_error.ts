import type { I18n } from '@adonisjs/i18n'
import { COMPLAINT_ERROR_CODES } from '../constants/complaint_error_codes.js'
import { ComplaintServiceError } from '../exceptions/complaint_service_error.js'
import type { ComplaintErrorCode } from '../constants/complaint_error_codes.js'

export type ResolvedComplaintError = {
  message: string
  title: string
  status: number
  errorCode: ComplaintErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  return i18n.formatMessage(key)
}

/**
 * Convierte excepciones del módulo de quejas en mensaje HTTP, status y errorCode estable.
 */
export function resolveComplaintApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedComplaintError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : translate(i18n, 'complaint_val_input', 'Datos inválidos'))
    return {
      message: msg,
      title: translate(i18n, 'complaint_title', 'Buzón de quejas'),
      status: 400,
      errorCode: COMPLAINT_ERROR_CODES.VAL_INPUT,
      key: 'AUTH.COMPLAINT.VAL_INPUT',
    }
  }

  if (error instanceof ComplaintServiceError) {
    const title = translate(i18n, 'complaint_title', 'Buzón de quejas')
    let message = error.message

    if (error.errorCode === COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND) {
      message = translate(i18n, 'complaint_employee_not_found', error.message)
    } else if (error.errorCode === COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND) {
      const messageKey =
        error.key === 'queja-no-encontrada' ? 'complaint_not_found' : 'complaint_status_not_found'
      message = translate(i18n, messageKey, error.message)
      return {
        message,
        title,
        status: error.httpStatus,
        errorCode: error.errorCode,
        key: error.key ?? 'caso-no-encontrado',
        detail: error.detail ?? message,
      }
    } else if (error.errorCode === COMPLAINT_ERROR_CODES.FOLIO_GENERATION_FAILED) {
      message = translate(i18n, 'complaint_folio_generation_failed', error.message)
    } else if (error.errorCode === COMPLAINT_ERROR_CODES.INVALID_FILE) {
      message = translate(i18n, 'complaint_attachment_invalid_file', error.message)
      return {
        message,
        title,
        status: error.httpStatus,
        errorCode: error.errorCode,
        key: error.key ?? 'archivo-invalido',
        detail: error.detail ?? message,
      }
    } else if (error.errorCode === COMPLAINT_ERROR_CODES.ATTACHMENT_NOT_FOUND) {
      message = translate(i18n, 'complaint_attachment_not_found', error.message)
      return {
        message,
        title,
        status: error.httpStatus,
        errorCode: error.errorCode,
        key: error.key ?? 'adjunto-no-encontrado',
        detail: error.detail ?? message,
      }
    }

    return {
      message,
      title,
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: error.detail ?? message,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : translate(i18n, 'an_unexpected_error_has_occurred_on_the_server', 'Error inesperado'),
    title: translate(i18n, 'server_error', 'Error del servidor'),
    status: fallbackStatus,
    errorCode: COMPLAINT_ERROR_CODES.SYS_UNHANDLED,
  }
}
