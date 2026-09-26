import type { I18n } from '@adonisjs/i18n'
import {
  NOM035_DISCLOSURE_ERROR_CODES,
  type Nom035DisclosureErrorCode,
} from '#constants/nom035_disclosure_error_codes'
import { Nom035DisclosureServiceError } from '#exceptions/nom035_disclosure_service_error'

export type ResolvedNom035DisclosureApiError = {
  message: string
  status: number
  errorCode: Nom035DisclosureErrorCode
}

export function resolveNom035DisclosureApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedNom035DisclosureApiError {
  const err = error as {
    status?: number
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    return {
      message:
        err.messages?.[0]?.message ??
        (typeof err.message === 'string'
          ? err.message
          : i18n?.formatMessage('nom035.disclosure.val_input') ?? 'Datos inválidos'),
      status: 400,
      errorCode: NOM035_DISCLOSURE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (error instanceof Nom035DisclosureServiceError) {
    return {
      message: error.message,
      status: error.httpStatus,
      errorCode: error.errorCode,
    }
  }

  if (err?.status === 403) {
    return {
      message: i18n?.formatMessage('nom035.disclosure.forbidden') ?? 'Sin permisos',
      status: 403,
      errorCode: NOM035_DISCLOSURE_ERROR_CODES.FORBIDDEN,
    }
  }

  return {
    message:
      typeof err?.message === 'string'
        ? err.message
        : i18n?.formatMessage('nom035.disclosure.sys_unhandled') ?? 'Error inesperado',
    status: fallbackStatus,
    errorCode: NOM035_DISCLOSURE_ERROR_CODES.SYS_UNHANDLED,
  }
}
