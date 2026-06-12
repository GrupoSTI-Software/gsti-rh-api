import type { I18n } from '@adonisjs/i18n'
import { ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/asignacion_contrato_especializado_error_codes.js'
import type { AsignacionContratoEspecializadoErrorCode } from '../constants/asignacion_contrato_especializado_error_codes.js'
import { AsignacionContratoEspecializadoError } from '../exceptions/asignacion_contrato_especializado_error.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'

export type ResolvedAsignacionContratoApiError = {
  message: string
  title: string
  status: number
  errorCode: AsignacionContratoEspecializadoErrorCode | string
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Record<AsignacionContratoEspecializadoErrorCode, string> = {
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT]: 'asignacion_contrato_val_input',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_EMPLOYEE_DUPLICATE]:
    'asignacion_contrato_val_employee_duplicate',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS]: 'asignacion_contrato_val_fechas',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND]: 'asignacion_contrato_not_found',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.EMPLOYEE_NOT_FOUND]:
    'asignacion_contrato_employee_not_found',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.CONTRATO_NO_VIGENTE]:
    'asignacion_contrato_contrato_no_vigente',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FUERA_DE_VIGENCIA]:
    'asignacion_contrato_fuera_de_vigencia',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.ASIGNACION_DUPLICADA]:
    'asignacion_contrato_duplicada',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN]: 'asignacion_contrato_forbidden',
  [ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED]:
    'asignacion_contrato_unexpected_error',
}

function resolveMessageKey(errorCode: AsignacionContratoEspecializadoErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: AsignacionContratoEspecializadoErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo en respuesta HTTP estable para el cliente.
 */
export function resolveAsignacionContratoEspecializadoApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedAsignacionContratoApiError {
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
      title: translate(i18n, 'asignacion_contrato_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof AsignacionContratoEspecializadoError) {
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
        detail: error.detail ?? message,
      }
    }
    if (error.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT) {
      return {
        message: error.message,
        title: translate(i18n, 'asignacion_contrato_val_input_title', 'Datos inválidos'),
        status: error.httpStatus,
        errorCode: ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        key: error.key,
        detail: error.detail,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'asignacion_contrato_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'asignacion_contrato_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: ASIGNACION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED,
  }
}
