import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'

/** Tope defensivo de empleados en la superficie pública self-service (no comercial). */
export const PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP = 100_000

const PLAN_UNAVAILABLE_DETAIL = 'El plan solicitado no está disponible.'

const EMPLOYEES_BLOCK_DETAIL =
  'La cantidad de empleados se contrata en bloques de 10, con un mínimo de 10.'

const EMPLOYEES_SAFETY_CAP_DETAIL =
  'La cantidad de empleados solicitada excede el máximo permitido en línea. Contacta a Valanserh para un plan a la medida.'

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

/** Cantidad fuera de bloques de 10 o por debajo del mínimo (superficie pública). */
export function employeesNotBlockOfTenError(): BillingSubscriptionServiceError {
  return new BillingSubscriptionServiceError(
    EMPLOYEES_BLOCK_DETAIL,
    BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
    422,
    'cantidad-no-multiplo-de-diez',
    EMPLOYEES_BLOCK_DETAIL
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

/** Cantidad sobre el tope defensivo de la superficie pública. */
export function employeesAboveSafetyCapError(): BillingSubscriptionServiceError {
  return new BillingSubscriptionServiceError(
    EMPLOYEES_SAFETY_CAP_DETAIL,
    BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP,
    422,
    'cantidad-fuera-de-rango',
    EMPLOYEES_SAFETY_CAP_DETAIL
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
