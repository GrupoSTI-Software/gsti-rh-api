import type { I18n } from '@adonisjs/i18n'
import {
  POSITION_LEVEL_ERROR_CODES,
  type PositionLevelErrorCode,
} from '#constants/position_level_error_codes'
import PositionLevelServiceError from '#exceptions/position_level_service_error'

/**
 * Forma única del error hacia el cliente en este dominio (spec §6):
 * el BO ramifica por `key`; `code` queda para trazabilidad.
 */
export type ResolvedPositionLevelApiError = {
  status: number
  title: string
  detail: string
  key: string
  code: PositionLevelErrorCode
}

/**
 * Convierte cualquier excepción del dominio de niveles de puesto en la
 * respuesta estable `{ title, detail, key, code }`. Aquí vive el mapeo
 * `message → detail` del spec §6.
 */
export function resolvePositionLevelApiError(
  error: unknown,
  i18n: I18n
): ResolvedPositionLevelApiError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      status: 400,
      title: i18n.formatMessage('position_level_val_input_title'),
      detail: err.messages?.[0]?.message ?? i18n.formatMessage('position_level_val_input_message'),
      key: 'datos-invalidos',
      code: POSITION_LEVEL_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof PositionLevelServiceError) {
    return {
      status: error.httpStatus,
      title: error.title,
      detail: error.message,
      key: error.key,
      code: error.errorCode,
    }
  }

  return {
    status: 500,
    title: i18n.formatMessage('position_level_unexpected_title'),
    detail:
      typeof err?.message === 'string'
        ? err.message
        : i18n.formatMessage('position_level_unexpected_message'),
    key: 'error-inesperado',
    code: POSITION_LEVEL_ERROR_CODES.SYS_UNHANDLED,
  }
}
