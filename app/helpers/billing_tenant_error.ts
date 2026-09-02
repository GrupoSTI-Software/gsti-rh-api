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

/** Tamaño del bloque comercial de empleados contratados (múltiplos de 10). */
export const EMPLOYEE_BLOCK_SIZE = 10

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

/**
 * Candado temporal (USRH1787714804401 §4.4, regla 16): mientras la
 * suscripción tenga un código de descuento vivo (beneficio no agotado),
 * los tres puntos de autoservicio que recalculan el precio quedan
 * cerrados. Lo retira el eslabón 9 en su primer commit.
 */
export function changeBlockedByDiscountCodeError(): BillingSubscriptionServiceError {
  const detail =
    'Esta suscripción tiene un código de descuento vigente y su cupo no puede cambiarse todavía. Escríbenos para ajustarlo.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_BLOCKED_BY_DISCOUNT_CODE,
    409,
    'cambio-bloqueado-por-codigo-de-descuento',
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

/** La cantidad pedida no supera la contratada vigente (regla 5 — USRH1786107870850). */
export function changeNotAnIncreaseError(
  contracted: number,
  requested: number
): BillingSubscriptionServiceError {
  const detail =
    'La cantidad solicitada no es mayor a tu cantidad contratada actual. Para reducir tu suscripción usa la opción de reducción.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_AN_INCREASE,
    422,
    'cantidad-no-es-aumento',
    detail,
    { contracted, requested }
  )
}

/** La suscripción se movió entre el cálculo y el registro (USRH1786107870850). */
export function subscriptionChangeConflictError(): BillingSubscriptionServiceError {
  const detail = 'Tu suscripción cambió mientras procesábamos la solicitud. Vuelve a intentarlo.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_CONFLICT,
    409,
    'cambio-en-conflicto',
    detail
  )
}

/** La cantidad pedida no es menor a la contratada: esta operación solo reduce (USRH1786107870853). */
export function changeNotADecreaseError(
  contracted: number,
  requested: number
): BillingSubscriptionServiceError {
  const detail = `Esta operación solo reduce la cantidad contratada. Tienes ${contracted} empleados contratados y pediste ${requested}.`
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.CHANGE_NOT_A_DECREASE,
    422,
    'cambio-no-es-reduccion',
    detail,
    { contracted, requested }
  )
}

/** No hay ningún cambio vivo que cancelar (USRH1786107870853). */
export function noLiveSubscriptionChangeError(): BillingSubscriptionServiceError {
  const detail = 'No tienes ningún cambio de suscripción agendado que se pueda cancelar.'
  return new BillingSubscriptionServiceError(
    detail,
    BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_CHANGE,
    422,
    'sin-cambio-vivo',
    detail
  )
}
