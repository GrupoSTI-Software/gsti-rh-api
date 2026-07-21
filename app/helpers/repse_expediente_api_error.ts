import type { I18n } from '@adonisjs/i18n'
import { REPSE_EXPEDIENTE_ERROR_CODES } from '../constants/repse_expediente_error_codes.js'
import type { RepseExpedienteErrorCode } from '../constants/repse_expediente_error_codes.js'
import { RepseExpedienteError } from '../exceptions/repse_expediente_error.js'
import { RepseProviderError } from '../exceptions/repse_provider_error.js'
import { REPSE_PROVIDER_ERROR_CODES } from '../constants/repse_provider_error_codes.js'

export type ResolvedRepseExpedienteApiError = {
  message: string
  title: string
  status: number
  errorCode: RepseExpedienteErrorCode | string
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Partial<Record<RepseExpedienteErrorCode, string>> = {
  [REPSE_EXPEDIENTE_ERROR_CODES.VAL_INPUT]: 'repse_expediente_val_input',
  [REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO]: 'repse_expediente_val_documento',
  [REPSE_EXPEDIENTE_ERROR_CODES.NOT_FOUND]: 'repse_expediente_not_found',
  [REPSE_EXPEDIENTE_ERROR_CODES.S3_UPLOAD_FAILED]: 'repse_expediente_s3_upload_failed',
  [REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN]: 'repse_expediente_forbidden',
  [REPSE_EXPEDIENTE_ERROR_CODES.FORBIDDEN_RETENTION]: 'repse_expediente_forbidden_retention',
  [REPSE_EXPEDIENTE_ERROR_CODES.SYS_UNHANDLED]: 'repse_expediente_unexpected_error',
}

function resolveMessageKey(errorCode: string, key?: string): string | undefined {
  if (errorCode === REPSE_EXPEDIENTE_ERROR_CODES.VAL_DOCUMENTO && key) {
    return `repse_expediente_val_documento_${key.replace(/-/g, '_')}_message`
  }
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as RepseExpedienteErrorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as RepseExpedienteErrorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo en respuesta HTTP estable para el cliente.
 */
export function resolveRepseExpedienteApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedRepseExpedienteApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const rawMessage =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: rawMessage,
      title: translate(i18n, 'repse_expediente_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: REPSE_EXPEDIENTE_ERROR_CODES.VAL_INPUT,
      key: 'entrada-invalida',
      detail: rawMessage,
    }
  }

  if (error instanceof RepseExpedienteError) {
    let resolvedKey = error.key
    if (
      resolvedKey &&
      ['archivo-faltante', 'documento-tipo-invalido', 'documento-tamano-excedido'].includes(
        resolvedKey
      )
    ) {
      resolvedKey = 'documento-invalido'
    }
    const message = translate(i18n, resolveMessageKey(error.errorCode, error.key), error.message)
    return {
      message,
      title: translate(i18n, resolveTitleKey(error.errorCode), error.message),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: resolvedKey,
      detail: error.detail ?? message,
    }
  }

  if (error instanceof RepseProviderError) {
    if (error.errorCode === REPSE_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND) {
      const message = translate(
        i18n,
        'repse_provider_not_found_message',
        'El proveedor REPSE no existe o no pertenece al tenant actual.'
      )
      return {
        message,
        title: translate(i18n, 'repse_provider_not_found_title', 'Proveedor REPSE no encontrado'),
        status: 404,
        errorCode: REPSE_EXPEDIENTE_ERROR_CODES.NOT_FOUND,
        key: 'proveedor-repse-no-encontrado',
        detail: message,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'repse_expediente_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'repse_expediente_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: REPSE_EXPEDIENTE_ERROR_CODES.SYS_UNHANDLED,
  }
}
