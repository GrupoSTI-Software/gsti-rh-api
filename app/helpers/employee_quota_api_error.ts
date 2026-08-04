import type { I18n } from '@adonisjs/i18n'
import { EMPLOYEE_QUOTA_ERROR_CODES } from '../constants/employee_quota_error_codes.js'
import type { EmployeeQuotaErrorCode } from '../constants/employee_quota_error_codes.js'
import { EmployeeQuotaError } from '../exceptions/employee_quota_error.js'

export type EmployeeQuotaErrorData = {
  contracted: number
  active: number
}

export type ResolvedEmployeeQuotaApiError = {
  message: string
  title: string
  status: number
  errorCode: EmployeeQuotaErrorCode | string
  key?: string
  detail?: string
  data: EmployeeQuotaErrorData
}

const ERROR_CODE_TO_I18N_BASE: Partial<Record<EmployeeQuotaErrorCode, string>> = {
  [EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED]: 'employee_quota_exceeded',
  [EMPLOYEE_QUOTA_ERROR_CODES.NO_PLAN]: 'employee_quota_no_plan',
  [EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_EXCEEDED]: 'employee_import_quota_exceeded',
  [EMPLOYEE_QUOTA_ERROR_CODES.IMPORT_NO_PLAN]: 'employee_import_quota_no_plan',
}

function resolveMessageKey(errorCode: EmployeeQuotaErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_message` : undefined
}

function resolveTitleKey(errorCode: EmployeeQuotaErrorCode): string | undefined {
  const base = ERROR_CODE_TO_I18N_BASE[errorCode]
  return base ? `${base}_title` : undefined
}

function resolveDetailKey(errorCode: EmployeeQuotaErrorCode): string | undefined {
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

function buildQuotaErrorData(
  i18nData?: Record<string, string | number>
): EmployeeQuotaErrorData {
  const contracted = Number(i18nData?.contracted ?? 0)
  const active = Number(i18nData?.active ?? 0)
  return {
    contracted: Number.isFinite(contracted) ? contracted : 0,
    active: Number.isFinite(active) ? active : 0,
  }
}

/** Cupo agotado en alta individual o reactivación. */
export function employeeQuotaExceededError(
  contracted: number,
  active: number
): EmployeeQuotaError {
  const i18nData = { contracted, active }
  return new EmployeeQuotaError(
    `Tu contratación cubre ${contracted} empleados y ya tienes ${active} vigentes.`,
    EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED,
    409,
    'cupo-empleados-agotado',
    `Contratados: ${contracted}. Vigentes: ${active}. Escríbenos a hola@valanserh.com para ampliar tu cupo.`,
    i18nData
  )
}

/** Empresa self-service sin contratación vigente. */
export function employeeQuotaNoPlanError(active: number): EmployeeQuotaError {
  const i18nData = { contracted: 0, active }
  return new EmployeeQuotaError(
    'Tu empresa no tiene un plan vigente, por eso no puedes dar de alta empleados. Los que ya tienes no se ven afectados.',
    EMPLOYEE_QUOTA_ERROR_CODES.NO_PLAN,
    409,
    'sin-plan-contratado',
    'Escríbenos a hola@valanserh.com para activar tu plan y reanudar el alta de empleados.',
    i18nData
  )
}

/**
 * Convierte excepciones del cupo de empleados en respuesta HTTP estable para el cliente.
 */
export function resolveEmployeeQuotaApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedEmployeeQuotaApiError {
  if (error instanceof EmployeeQuotaError) {
    const data = buildQuotaErrorData(error.i18nData)
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
      title: translate(i18n, resolveTitleKey(error.errorCode), error.message, error.i18nData),
      status: error.httpStatus,
      errorCode: error.errorCode,
      key: error.key,
      detail,
      data,
    }
  }

  const err = error as { message?: string }
  return {
    message: typeof err?.message === 'string' ? err.message : 'Error inesperado',
    title: translate(i18n, 'employee_quota_error_default_title', 'Error'),
    status: fallbackStatus,
    errorCode: EMPLOYEE_QUOTA_ERROR_CODES.EXCEEDED,
    data: { contracted: 0, active: 0 },
  }
}
