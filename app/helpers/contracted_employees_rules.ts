import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'

/**
 * Reglas de cantidad contratada — módulo neutral compartido por las dos
 * superficies de contratación: el registro self-service del tenant
 * (USRH1785441817226) y la consola landlord (USRH1785962095089). Ninguna
 * de las dos depende de la otra; ambas invocan aquí. `BillingTenantService`
 * delega en estas funciones para conservar su API pública intacta.
 */

/** Mínimo comercial de empleados contratados (bloques de 10). */
export const MIN_CONTRACTED_EMPLOYEES = 10

/** Tope defensivo de empleados contratados, compartido por las dos superficies. */
export const PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP = 100_000

const EMPLOYEES_BLOCK_DETAIL =
  'La cantidad de empleados se contrata en bloques de 10, con un mínimo de 10.'

const EMPLOYEES_SAFETY_CAP_DETAIL =
  'La cantidad de empleados solicitada excede el máximo permitido en línea. Contacta a Valanserh para un plan a la medida.'

/** Cantidad fuera de bloques de 10 o por debajo del mínimo. */
export function employeesNotBlockOfTenError(): BillingSubscriptionServiceError {
  return new BillingSubscriptionServiceError(
    EMPLOYEES_BLOCK_DETAIL,
    BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN,
    422,
    'cantidad-no-multiplo-de-diez',
    EMPLOYEES_BLOCK_DETAIL
  )
}

/** Cantidad sobre el tope defensivo. */
export function employeesAboveSafetyCapError(): BillingSubscriptionServiceError {
  return new BillingSubscriptionServiceError(
    EMPLOYEES_SAFETY_CAP_DETAIL,
    BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP,
    422,
    'cantidad-fuera-de-rango',
    EMPLOYEES_SAFETY_CAP_DETAIL
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

/** Regla 1 — bloques de 10, mínimo 10, tope defensivo. */
export function assertContractedEmployees(employeeCount: number): void {
  if (employeeCount > PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP) {
    throw employeesAboveSafetyCapError()
  }

  if (employeeCount < MIN_CONTRACTED_EMPLOYEES || employeeCount % 10 !== 0) {
    throw employeesNotBlockOfTenError()
  }
}

/**
 * Mínimo contratable: el siguiente bloque de 10 por encima de la plantilla
 * activa. Con 0 activos devuelve el mínimo general (10).
 */
export function resolveMinimumContractedEmployees(activeEmployees: number): number {
  if (activeEmployees <= 0) {
    return MIN_CONTRACTED_EMPLOYEES
  }
  return Math.max(MIN_CONTRACTED_EMPLOYEES, Math.ceil(activeEmployees / 10) * 10)
}

/** Regla 2/3 — la cantidad contratada no puede ser menor que el mínimo por plantilla. */
export function assertMinimumContractedEmployees(
  contractedEmployees: number,
  activeEmployees: number
): void {
  const minimum = resolveMinimumContractedEmployees(activeEmployees)
  if (contractedEmployees < minimum) {
    throw employeesBelowActiveHeadcountError(activeEmployees, minimum)
  }
}
