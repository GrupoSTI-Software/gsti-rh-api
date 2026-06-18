import type { I18n } from '@adonisjs/i18n'
import { DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/documento_contrato_especializado_error_codes.js'
import type { DocumentoContratoEspecializadoErrorCode } from '../constants/documento_contrato_especializado_error_codes.js'
import { DocumentoContratoEspecializadoError } from '../exceptions/documento_contrato_especializado_error.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'

export type ResolvedDocumentoContratoApiError = {
  message: string
  title: string
  status: number
  errorCode: DocumentoContratoEspecializadoErrorCode | string
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Partial<Record<DocumentoContratoEspecializadoErrorCode, string>> = {
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT]: 'documento_contrato_val_input',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_VIGENCIA]:
    'documento_contrato_val_vigencia',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_DOCUMENTO]:
    'documento_contrato_val_documento',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND]: 'documento_contrato_not_found',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.S3_UPLOAD_FAILED]:
    'documento_contrato_s3_upload_failed',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN]: 'documento_contrato_forbidden',
  [DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED]:
    'documento_contrato_unexpected_error',
}

function resolveMessageKey(errorCode: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as DocumentoContratoEspecializadoErrorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as DocumentoContratoEspecializadoErrorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo en respuesta HTTP estable para el cliente.
 */
export function resolveDocumentoContratoApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedDocumentoContratoApiError {
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
      title: translate(i18n, 'documento_contrato_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof DocumentoContratoEspecializadoError) {
    const message = translate(i18n, resolveMessageKey(error.errorCode), error.message)
    return {
      message,
      title: translate(i18n, resolveTitleKey(error.errorCode), error.message),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: error.detail ?? message,
    }
  }

  if (error instanceof ContratoServicioEspecializadoError) {
    if (error.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND) {
      const message = translate(
        i18n,
        'contrato_servicio_especializado_not_found_message',
        error.message
      )
      return {
        message,
        title: translate(
          i18n,
          'contrato_servicio_especializado_not_found_title',
          'Contrato no encontrado'
        ),
        status: error.httpStatus,
        errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
        key: error.key ?? 'contrato-no-encontrado',
        detail: message,
      }
    }
    if (error.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT) {
      return {
        message: error.message,
        title: translate(i18n, 'documento_contrato_val_input_title', 'Datos inválidos'),
        status: error.httpStatus,
        errorCode: DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        key: error.key,
        detail: error.detail,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'documento_contrato_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'documento_contrato_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: DOCUMENTO_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED,
  }
}
