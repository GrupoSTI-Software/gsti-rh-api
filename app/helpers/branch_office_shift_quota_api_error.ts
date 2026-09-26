import type { I18n } from '@adonisjs/i18n'
import { BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES } from '../constants/branch_office_shift_quota_error_codes.js'
import type { BranchOfficeShiftQuotaErrorCode } from '../constants/branch_office_shift_quota_error_codes.js'
import { BranchOfficeShiftQuotaError } from '../exceptions/branch_office_shift_quota_error.js'

export type ResolvedBranchOfficeShiftQuotaApiError = {
  message: string
  title: string
  status: number
  errorCode: BranchOfficeShiftQuotaErrorCode | string
  key?: string
  detail?: string
}

const ERROR_CODE_TO_I18N_BASE: Record<BranchOfficeShiftQuotaErrorCode, string> = {
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_INPUT]: 'branch_office_shift_quota_val_input',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_BRANCH_OFFICE_ID]:
    'branch_office_shift_quota_invalid_branch_office_id',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_SHIFT_DUPLICATE]:
    'branch_office_shift_quota_val_shift_duplicate',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.BRANCH_NOT_FOUND]:
    'branch_office_shift_quota_branch_not_found',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.SHIFT_NOT_FOUND]:
    'branch_office_shift_quota_shift_not_found',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.INVALID_QUOTA]:
    'branch_office_shift_quota_invalid',
  [BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.SYS_UNHANDLED]:
    'branch_office_shift_quota_unexpected_error',
}

function resolveMessageKey(errorCode: BranchOfficeShiftQuotaErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: BranchOfficeShiftQuotaErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

function resolveDetailKey(errorCode: BranchOfficeShiftQuotaErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_detail` : undefined
}

function translate(
  i18n: I18n | undefined,
  key: string | undefined,
  fallback: string,
  data?: Record<string, string | number>
): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, data, fallback)
}

/**
 * Convierte excepciones del módulo de cuotas en respuesta HTTP estable para el cliente.
 * Los textos se resuelven aquí según `Accept-Language`, no al lanzar la excepción.
 */
export function resolveBranchOfficeShiftQuotaApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedBranchOfficeShiftQuotaApiError {
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
      title: translate(i18n, 'branch_office_shift_quota_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.VAL_INPUT,
    }
  }

  if (err?.code === 'E_ROW_NOT_FOUND') {
    const message = translate(
      i18n,
      'branch_office_shift_quota_branch_not_found_message',
      'Sucursal no encontrada o no disponible para esta instancia del sistema'
    )
    return {
      message,
      title: translate(
        i18n,
        'branch_office_shift_quota_branch_not_found_title',
        'Sucursal no encontrada'
      ),
      status: 404,
      errorCode: BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.BRANCH_NOT_FOUND,
      key: 'sucursal-no-encontrada',
      detail: message,
    }
  }

  if (error instanceof BranchOfficeShiftQuotaError) {
    const message = translate(
      i18n,
      resolveMessageKey(error.errorCode),
      error.message,
      error.i18nData
    )
    const detail = translate(
      i18n,
      resolveDetailKey(error.errorCode),
      error.detail ?? error.message,
      error.i18nData
    )
    return {
      message,
      title: translate(i18n, resolveTitleKey(error.errorCode), error.message),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    title: translate(i18n, 'branch_office_shift_quota_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: BRANCH_OFFICE_SHIFT_QUOTA_ERROR_CODES.SYS_UNHANDLED,
  }
}
