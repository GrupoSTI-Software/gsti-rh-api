import {
  BUSINESS_UNIT_SIGNUP_ERRORS,
} from '../constants/business_unit_signup_error_codes.js'
import { BusinessUnitSignupServiceError } from '../exceptions/business_unit_signup_service_error.js'

/**
 * Constructores de error del alta de empresa adicional (USRH1787932877001).
 * Cada función fabrica un `BusinessUnitSignupServiceError` con los campos
 * del catálogo `BUSINESS_UNIT_SIGNUP_ERRORS`. Fuente única: cambiar la
 * descripción en el catálogo refleja en todos los llamadores.
 */

export function forbiddenRoleError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.FORBIDDEN_ROLE
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}

export function duplicateNameError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.DUPLICATE_NAME
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}

export function limitReachedError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.LIMIT_REACHED
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}

export function slugConflictError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.SLUG_CONFLICT
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}

export function settingsProvisioningFailedError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.SETTINGS_PROVISIONING_FAILED
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}

export function creationFailedError(): BusinessUnitSignupServiceError {
  const e = BUSINESS_UNIT_SIGNUP_ERRORS.CREATION_FAILED
  return new BusinessUnitSignupServiceError(e.title, e.code, e.status, e.key, e.detail)
}
