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
  const translated = i18n.formatMessage(key)
  return translated === key ? fallback : translated
}

/** Resuelve la clave i18n del mensaje a partir del error de dominio. */
function resolveComplaintMessageKey(error: ComplaintServiceError): string | undefined {
  if (error.messageKey) {
    return error.messageKey
  }

  const byClientKey: Record<string, string> = {
    'AUTH.COMPLAINT.PERSON_NOT_FOUND': 'complaint_person_not_found',
    'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND': 'complaint_employee_not_found',
    'AUTH.COMPLAINT.FOLIO_GENERATION_FAILED': 'complaint_folio_generation_failed',
    'caso-no-encontrado': 'complaint_status_not_found',
    'queja-no-encontrada': 'complaint_not_found',
    'nota-requerida': 'complaint_note_required',
    'estatus-sin-cambio': 'complaint_status_unchanged',
    'archivo-invalido': 'complaint_attachment_invalid_file',
    'adjunto-no-encontrado': 'complaint_attachment_not_found',
    'complaint-attachment-upload-failed': 'complaint_attachment_upload_failed',
    'complaint-attachment-download-failed': 'complaint_attachment_download_failed',
    'sin-permiso': 'complaint_forbidden',
  }

  if (error.key && byClientKey[error.key]) {
    return byClientKey[error.key]
  }

  const byErrorCode: Partial<Record<ComplaintErrorCode, string>> = {
    [COMPLAINT_ERROR_CODES.VAL_INPUT]: 'complaint_val_input',
    [COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND]: 'complaint_employee_not_found',
    [COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND]: 'complaint_not_found',
    [COMPLAINT_ERROR_CODES.FORBIDDEN]: 'complaint_forbidden',
    [COMPLAINT_ERROR_CODES.FOLIO_GENERATION_FAILED]: 'complaint_folio_generation_failed',
    [COMPLAINT_ERROR_CODES.INVALID_FILE]: 'complaint_attachment_invalid_file',
    [COMPLAINT_ERROR_CODES.ATTACHMENT_NOT_FOUND]: 'complaint_attachment_not_found',
    [COMPLAINT_ERROR_CODES.S3_OPERATION_FAILED]: 'complaint_attachment_upload_failed',
    [COMPLAINT_ERROR_CODES.NOTE_REQUIRED]: 'complaint_note_required',
  }

  return byErrorCode[error.errorCode]
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

  const title = translate(i18n, 'complaint_title', 'Buzón de quejas')

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      translate(i18n, 'complaint_val_input', 'Datos inválidos')
    return {
      message: msg,
      title,
      status: 400,
      errorCode: COMPLAINT_ERROR_CODES.VAL_INPUT,
      key: 'AUTH.COMPLAINT.VAL_INPUT',
      detail: msg,
    }
  }

  if (error instanceof ComplaintServiceError) {
    const messageKey = resolveComplaintMessageKey(error)
    const message = messageKey
      ? translate(i18n, messageKey, error.message)
      : error.message

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
    message:
      typeof err?.message === 'string'
        ? err.message
        : translate(i18n, 'an_unexpected_error_has_occurred_on_the_server', 'Error inesperado'),
    title: translate(i18n, 'server_error', 'Error del servidor'),
    status: fallbackStatus,
    errorCode: COMPLAINT_ERROR_CODES.SYS_UNHANDLED,
  }
}
