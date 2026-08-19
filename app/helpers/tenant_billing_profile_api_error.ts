import {
  TENANT_BILLING_PROFILE_ERRORS,
  type TenantBillingProfileErrorDefinition,
} from '#constants/tenant_billing_profile_error_codes'
import { TenantBillingProfileServiceError } from '#exceptions/tenant_billing_profile_service_error'

export type ResolvedTenantBillingProfileError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

function fromDefinition(
  definition: TenantBillingProfileErrorDefinition,
  detailOverride?: string
): ResolvedTenantBillingProfileError {
  return {
    title: definition.title,
    detail: detailOverride ?? definition.detail,
    key: definition.key,
    code: definition.code,
    status: definition.status,
  }
}

function resolveDefinitionByCode(
  code: string
): TenantBillingProfileErrorDefinition | undefined {
  return Object.values(TENANT_BILLING_PROFILE_ERRORS).find((entry) => entry.code === code)
}

/**
 * Convierte excepciones del módulo de perfil fiscal en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo TNT.BILL.*.
 */
export function resolveTenantBillingProfileApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedTenantBillingProfileError {
  const err = error as {
    code?: string
    messages?: Array<{ message?: string; rule?: string }>
    message?: string
  }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const firstRule = err.messages?.[0]?.rule
    if (firstRule === 'rfc_sat') {
      return fromDefinition(TENANT_BILLING_PROFILE_ERRORS.RFC_INVALID)
    }

    const detail = err.messages?.[0]?.message ?? TENANT_BILLING_PROFILE_ERRORS.VAL_INPUT.detail
    return fromDefinition(TENANT_BILLING_PROFILE_ERRORS.VAL_INPUT, detail)
  }

  if (error instanceof TenantBillingProfileServiceError) {
    const definition = resolveDefinitionByCode(error.errorCode)

    return {
      title: definition?.title ?? TENANT_BILLING_PROFILE_ERRORS.FORBIDDEN_ROLE.title,
      detail: error.detail ?? error.message,
      key: error.key ?? definition?.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  const unhandled = fromDefinition(
    TENANT_BILLING_PROFILE_ERRORS.SYS_UNHANDLED,
    typeof err?.message === 'string' ? err.message : TENANT_BILLING_PROFILE_ERRORS.SYS_UNHANDLED.detail
  )

  return {
    ...unhandled,
    status: fallbackStatus,
  }
}
