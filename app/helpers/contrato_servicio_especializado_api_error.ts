import type { I18n } from '@adonisjs/i18n'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import type { ContratoServicioEspecializadoErrorCode } from '../constants/contrato_servicio_especializado_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'

export type ResolvedContratoServicioEspecializadoApiError = {
  message: string
  title: string
  status: number
  errorCode: ContratoServicioEspecializadoErrorCode
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Record<ContratoServicioEspecializadoErrorCode, string> = {
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT]: 'contrato_servicio_especializado_val_input',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS]: 'contrato_servicio_especializado_val_fechas',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND]: 'contrato_servicio_especializado_not_found',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.CONTRATANTE_NOT_FOUND]:
    'contrato_servicio_especializado_contratante_not_found',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.REPSE_NOT_FOUND]:
    'contrato_servicio_especializado_repse_not_found',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NUMERO_DUPLICATE]:
    'contrato_servicio_especializado_numero_duplicate',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SERVICIOS_REGISTRADOS_REQUERIDOS]:
    'contrato_servicio_especializado_servicios_registrados_requeridos',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SERVICIO_REGISTRADO_NOT_FOUND]:
    'contrato_servicio_especializado_servicio_registrado_not_found',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN]: 'contrato_servicio_especializado_forbidden',
  [CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED]:
    'contrato_servicio_especializado_unexpected_error',
}

function resolveMessageKey(errorCode: ContratoServicioEspecializadoErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: ContratoServicioEspecializadoErrorCode): string | undefined {
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
export function resolveContratoServicioEspecializadoApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedContratoServicioEspecializadoApiError {
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
      title: translate(
        i18n,
        'contrato_servicio_especializado_val_input_title',
        'Datos inválidos'
      ),
      status: 400,
      errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof ContratoServicioEspecializadoError) {
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

  if (error instanceof EmpresaContratanteError) {
    if (error.errorCode === EMPRESA_CONTRATANTE_ERROR_CODES.NOT_FOUND) {
      const message = translate(
        i18n,
        'contrato_servicio_especializado_contratante_not_found_message',
        error.message
      )
      return {
        message,
        title: translate(
          i18n,
          'contrato_servicio_especializado_contratante_not_found_title',
          'Empresa contratante no encontrada'
        ),
        status: error.httpStatus,
        errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.CONTRATANTE_NOT_FOUND,
        key: error.key ?? 'empresa-contratante-no-encontrada',
        detail: message,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'contrato_servicio_especializado_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'contrato_servicio_especializado_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED,
  }
}
