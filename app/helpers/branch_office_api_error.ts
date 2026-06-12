import type { I18n } from '@adonisjs/i18n'
import { BRANCH_OFFICE_ERROR_CODES } from '../constants/branch_office_error_codes.js'
import { BranchOfficeServiceError } from '../exceptions/branch_office_service_error.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import type { BranchOfficeErrorCode } from '../constants/branch_office_error_codes.js'

export type ResolvedBranchOfficeError = {
  message: string
  title: string
  status: number
  errorCode: BranchOfficeErrorCode | string
  key?: string
  detail?: string
}

function translate(i18n: I18n | undefined, key: string | undefined, fallback: string): string {
  if (!i18n || !key) return fallback
  return i18n.t(key, undefined, fallback)
}

/**
 * Convierte excepciones del módulo de sucursales en mensaje HTTP, status y errorCode estable.
 * El cliente puede usar `errorCode` con un mapa fijo sin inspeccionar el texto del mensaje.
 */
export function resolveBranchOfficeApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedBranchOfficeError {
  const err = error as {
    code?: string
    message?: string
    messages?: Array<{ message?: string }>
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const msg =
      err.messages?.[0]?.message ??
      (typeof err.message === 'string' ? err.message : 'Error de validación')
    return {
      message: msg,
      title: translate(i18n, 'branch_office_val_input_title', 'Datos inválidos'),
      status: 400,
      errorCode: BRANCH_OFFICE_ERROR_CODES.VAL_INPUT,
    }
  }

  if (err?.code === 'E_ROW_NOT_FOUND') {
    return {
      message:
        typeof err.message === 'string'
          ? err.message
          : 'Sucursal no encontrada o no disponible para esta instancia del sistema',
      title: translate(i18n, 'branch_office_not_found_title', 'Sucursal no encontrada'),
      status: 404,
      errorCode: BRANCH_OFFICE_ERROR_CODES.NOT_FOUND,
    }
  }

  if (error instanceof EmpresaContratanteError) {
    if (error.key === 'empresa-contratante-no-encontrada') {
      const detail = translate(
        i18n,
        'empresa_contratante_not_found_branch_detail',
        'No se encontró la empresa contratante indicada'
      )
      return {
        message: detail,
        title: translate(
          i18n,
          'empresa_contratante_not_found_title',
          'Empresa contratante no encontrada'
        ),
        status: error.httpStatus,
        errorCode: error.errorCode,
        key: error.key,
        detail,
      }
    }

    const message = translate(
      i18n,
      'empresa_contratante_not_found_message',
      error.message
    )
    return {
      message,
      title: translate(
        i18n,
        'empresa_contratante_not_found_title',
        'Empresa contratante no encontrada'
      ),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: error.detail ?? message,
    }
  }

  if (error instanceof BranchOfficeServiceError) {
    if (error.errorCode === BRANCH_OFFICE_ERROR_CODES.ALREADY_LINKED) {
      const detail = translate(
        i18n,
        'branch_office_already_linked_message',
        error.detail ?? error.message
      )
      return {
        message: detail,
        title: translate(
          i18n,
          'branch_office_already_linked_title',
          'Sucursal ya ligada'
        ),
        status: error.httpStatus,
        errorCode: error.errorCode,
        key: error.key ?? 'sucursal-ya-ligada',
        detail,
      }
    }

    return {
      message: error.message,
      title: translate(i18n, 'branch_office_error_default_title', 'Error'),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail: error.detail ?? error.message,
    }
  }

  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    title: translate(i18n, 'branch_office_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: BRANCH_OFFICE_ERROR_CODES.SYS_UNHANDLED,
  }
}
