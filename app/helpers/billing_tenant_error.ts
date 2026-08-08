import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'

/** Tope defensivo de empleados en la superficie pública self-service (no comercial). */
export const PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP = 100_000

/** Mínimo comercial de empleados contratados en superficie self-service (bloques de 10). */
export const MIN_CONTRACTED_EMPLOYEES = 10

/** Tamaño del bloque comercial de empleados contratados (múltiplos de 10). */
export const EMPLOYEE_BLOCK_SIZE = 10

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

/** Cantidad contratada por debajo del mínimo exigido por la plantilla activa. */
export function employeesBelowActiveHeadcountError(
  activeEmployees: number,
  minimum: number
): BillingSubscriptionServiceError {
  const detail = `Tienes ${activeEmployees} empleados activos. La cantidad mínima que puedes contratar es ${minimum}.`
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_BELOW_ACTIVE_HEADCOUNT,
    422,
    'cantidad-menor-a-plantilla-activa',
    detail,
    { active: activeEmployees, minimum }
  )
}

/** Sin suscripción viva para previsualizar un cambio de cantidad. */
export function noLiveSubscriptionError(): BillingSubscriptionServiceError {
  const detail = 'No tienes una contratación viva que se pueda cambiar.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_SUBSCRIPTION,
    422,
    'sin-suscripcion-viva',
    detail
  )
}

/** Suscripción con pago atrasado; debe regularizarse antes de cambiar cantidad. */
export function subscriptionPastDueError(): BillingSubscriptionServiceError {
  const detail =
    'Tu suscripción tiene un pago pendiente. Ponte al corriente para poder cambiar tu cantidad contratada.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.SUBSCRIPTION_PAST_DUE,
    422,
    'suscripcion-con-pago-atrasado',
    detail
  )
}

/** Periodo vigente sin días por delante para prorratear. */
export function periodNotProratableError(): BillingSubscriptionServiceError {
  const detail =
    'Tu periodo vigente no tiene días por delante, así que no hay nada que prorratear. Registra tu pago para abrir el siguiente periodo.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.PERIOD_NOT_PRORATABLE,
    422,
    'periodo-sin-dias-por-prorratear',
    detail
  )
}

/** Solo el dueño de la cuenta puede consultar el costo del cambio. */
export function onlyAccountOwnerError(): BillingSubscriptionServiceError {
  const detail =
    'Solo el dueño de la cuenta puede consultar el costo de un cambio de suscripción.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.FORBIDDEN_ROLE,
    403,
    'solo-el-dueno-de-la-cuenta',
    detail
  )
}
