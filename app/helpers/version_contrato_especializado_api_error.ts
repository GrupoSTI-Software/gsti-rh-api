import type { I18n } from '@adonisjs/i18n'
import { VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/version_contrato_especializado_error_codes.js'
import type { VersionContratoEspecializadoErrorCode } from '../constants/version_contrato_especializado_error_codes.js'
import { VersionContratoEspecializadoError } from '../exceptions/version_contrato_especializado_error.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'

export type ResolvedVersionContratoApiError = {
  message: string
  title: string
  status: number
  errorCode: VersionContratoEspecializadoErrorCode | string
  key?: string
  detail?: string
}

export type ResolveVersionContratoApiErrorOptions = {
  /** Cuando se define, los errores VineJS se mapean a este key/código (p. ej. addendum). */
  validationErrorCode?: VersionContratoEspecializadoErrorCode
  validationKey?: string
  validationTitleKey?: string
}

const ERROR_CODE_TO_I18N_BASE: Partial<
  Record<VersionContratoEspecializadoErrorCode, string>
> = {
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT]: 'version_contrato_especializado_val_input',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_ADDENDUM]:
    'version_contrato_especializado_addendum_invalid',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_VIGENCIA]:
    'version_contrato_especializado_val_vigencia',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.CONTRATO_NOT_FOUND]:
    'version_contrato_especializado_contrato_not_found',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VERSION_NOT_FOUND]:
    'version_contrato_especializado_version_not_found',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_RENEWABLE]:
    'version_contrato_especializado_not_renewable',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_ADDENDABLE]:
    'version_contrato_especializado_not_addendable',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SNAPSHOT_INCOMPLETE]:
    'version_contrato_especializado_snapshot_incomplete',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.IMMUTABLE]:
    'version_contrato_especializado_immutable',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.FORBIDDEN]: 'version_contrato_especializado_forbidden',
  [VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED]:
    'version_contrato_especializado_unexpected_error',
}

function resolveMessageKey(errorCode: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as VersionContratoEspecializadoErrorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: string): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode as VersionContratoEspecializadoErrorCode]
  return base ? `${base}_title` : undefined
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo de versiones en respuesta HTTP estable para el cliente.
 */
export function resolveVersionContratoApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n,
  options?: ResolveVersionContratoApiErrorOptions
): ResolvedVersionContratoApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const rawMessage =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    const errorCode =
      options?.validationErrorCode ?? VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT
    const titleKey =
      options?.validationTitleKey ??
      (errorCode === VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_ADDENDUM
        ? 'version_contrato_especializado_addendum_invalid_title'
        : 'version_contrato_especializado_val_input_title')
    return {
      message: rawMessage,
      title: translate(i18n, titleKey, 'Datos inválidos'),
      status: 400,
      errorCode,
      key: options?.validationKey,
    }
  }

  if (error instanceof VersionContratoEspecializadoError) {
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
        errorCode: VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.CONTRATO_NOT_FOUND,
        key: error.key ?? 'contrato-no-encontrado',
        detail: message,
      }
    }
    if (error.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT) {
      return {
        message: error.message,
        title: translate(i18n, 'version_contrato_especializado_val_input_title', 'Datos inválidos'),
        status: error.httpStatus,
        errorCode: options?.validationErrorCode ?? VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_INPUT,
        key: options?.validationKey ?? error.key,
        detail: error.detail,
      }
    }
    if (error.errorCode === CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.VAL_FECHAS) {
      const message = translate(
        i18n,
        'contrato_servicio_especializado_val_fechas_message',
        error.detail ?? error.message
      )
      return {
        message,
        title: translate(
          i18n,
          options?.validationTitleKey ?? 'version_contrato_especializado_addendum_invalid_title',
          'Addendum inválido'
        ),
        status: options?.validationKey ? 400 : error.httpStatus,
        errorCode:
          options?.validationErrorCode ?? VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_ADDENDUM,
        key: options?.validationKey ?? error.key,
        detail: message,
      }
    }
  }

  const fallbackMessage = typeof err?.message === 'string' ? err.message : 'Error inesperado'
  return {
    message: translate(
      i18n,
      'version_contrato_especializado_unexpected_error_message',
      fallbackMessage
    ),
    title: translate(i18n, 'version_contrato_especializado_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SYS_UNHANDLED,
  }
}
