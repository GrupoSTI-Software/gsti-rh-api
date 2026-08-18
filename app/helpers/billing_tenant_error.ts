import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  employeesAboveSafetyCapError,
  employeesBelowActiveHeadcountError,
  employeesNotBlockOfTenError,
  MIN_CONTRACTED_EMPLOYEES,
  PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP,
} from './contracted_employees_rules.js'

// Reglas de cantidad movidas al módulo neutral `contracted_employees_rules.ts`
// (USRH1785962095089): se re-exportan aquí para no romper a los consumidores
// existentes de este helper (`BillingTenantService`, `SignupDraftService`).
export {
  employeesAboveSafetyCapError,
  employeesBelowActiveHeadcountError,
  employeesNotBlockOfTenError,
  MIN_CONTRACTED_EMPLOYEES,
  PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP,
}

const PLAN_UNAVAILABLE_DETAIL = 'El plan solicitado no está disponible.'

/**
 * Errores de catálogo que en la superficie pública se colapsan a plan no disponible
 * (regla 7 — no revelar si existe, está en borrador, inactivo o sin precio vigente).
 */
const PUBLIC_COLLAPSED_CATALOG_CODES = new Set<string>([
  BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
])

/**
 * Traduce un `BillingCatalogServiceError` al estilo de suscripciones para visitantes
 * anónimos. Devuelve `null` si el error no aplica a la superficie pública.
 */
export function mapCatalogErrorForPublicSurface(
  error: unknown
): BillingSubscriptionServiceError | null {
  if (!(error instanceof BillingCatalogServiceError)) {
    return null
  }

  if (!PUBLIC_COLLAPSED_CATALOG_CODES.has(error.errorCode)) {
    return null
  }

  return planUnavailableError()
}

/** Plan no vendible / no disponible en consulta pública. */
export function planUnavailableError(): BillingSubscriptionServiceError {
  return new BillingSubscriptionServiceError(
    PLAN_UNAVAILABLE_DETAIL,
    BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
    404,
    'plan-no-disponible',
    PLAN_UNAVAILABLE_DETAIL
  )
}

/** Borrador de registro sin plan o cantidad seleccionados. */
export function planNotSelectedError(): BillingSubscriptionServiceError {
  const detail =
    'El registro no tiene un plan seleccionado. Vuelve a iniciar el registro eligiendo tu plan.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_SELECTED,
    422,
    'plan-no-seleccionado',
    detail
  )
}

/**
 * Re-lanza errores de catálogo mapeados o devuelve el error original.
 * Pensado para envolver llamadas a `resolvePrice` desde la superficie pública.
 */
export function rethrowCatalogErrorForPublicSurface(error: unknown): never {
  const mapped = mapCatalogErrorForPublicSurface(error)
  if (mapped) {
    throw mapped
  }

  throw error
}

/** Empresa de alta manual intentando contratar por la vía self-service del tenant. */
export function originNotSelfServiceError(): BillingSubscriptionServiceError {
  const detail = 'Esta empresa no contrata en línea. Escríbenos a hola@valanserh.com.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.ORIGIN_NOT_SELF_SERVICE,
    422,
    'empresa-no-self-service',
    detail
  )
}

