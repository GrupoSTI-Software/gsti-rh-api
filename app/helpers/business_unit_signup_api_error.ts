import { BusinessUnitSignupServiceError } from '../exceptions/business_unit_signup_service_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import { SignupServiceError } from '../exceptions/signup_service_error.js'
import { BUSINESS_UNIT_SIGNUP_ERRORS } from '../constants/business_unit_signup_error_codes.js'

export interface ResolvedBusinessUnitSignupError {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Traduce el error del servicio del alta a un objeto HTTP-resuelto
 * `{ title, detail, key, code, status }`.
 *
 * Orden de ramas (R-2 del spec §5, spec-USRH1787932877001.md):
 *   1. Errores de validación de Vine (E_VALIDATION_ERROR) → TNT.BU.VAL_INPUT 422
 *   2. `BusinessUnitSignupServiceError` — errores tipados del alta (TNT.BU.*)
 *   3. `BillingSubscriptionServiceError` — errores de cantidad/plan (PLT.SUB.*)
 *   4. `SignupServiceError` — fallo de provisión de system_settings → SETTINGS_PROVISIONING_FAILED
 *   5. Catch-all → CREATION_FAILED 500 con `detail` **fijo** del catálogo (S-6: sin sqlMessage crudo)
 *
 * El llamador es responsable de logear `{ err }` para las ramas 4 y 5.
 */
export function resolveAdditionalBusinessUnitApiError(
  error: unknown
): ResolvedBusinessUnitSignupError {
  const asAny = error as {
    code?: string
    messages?: Array<{ message?: string }>
    message?: string
  }

  if (asAny?.code === 'E_VALIDATION_ERROR') {
    const detail = asAny.messages?.[0]?.message ?? 'Datos inválidos'
    const e = BUSINESS_UNIT_SIGNUP_ERRORS.VAL_INPUT
    return { title: e.title, detail, key: e.key, code: e.code, status: e.status }
  }

  if (error instanceof BusinessUnitSignupServiceError) {
    return {
      title: error.message,
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  if (error instanceof BillingSubscriptionServiceError) {
    return {
      title: 'Suscripciones',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  if (error instanceof SignupServiceError) {
    const e = BUSINESS_UNIT_SIGNUP_ERRORS.SETTINGS_PROVISIONING_FAILED
    return { title: e.title, detail: e.detail, key: e.key, code: e.code, status: e.status }
  }

  const e = BUSINESS_UNIT_SIGNUP_ERRORS.CREATION_FAILED
  return { title: e.title, detail: e.detail, key: e.key, code: e.code, status: e.status }
}
