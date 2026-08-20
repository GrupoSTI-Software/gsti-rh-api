import {
  TENANT_BILLING_PROFILE_ERRORS,
  type TenantBillingProfileErrorDefinition,
} from '#constants/tenant_billing_profile_error_codes'
import { TenantBillingProfileServiceError } from '#exceptions/tenant_billing_profile_service_error'

function toServiceError(
  definition: TenantBillingProfileErrorDefinition,
  detailOverride?: string
): TenantBillingProfileServiceError {
  const detail = detailOverride ?? definition.detail

  return new TenantBillingProfileServiceError(
    detail,
    definition.code,
    definition.status,
    definition.key,
    detail
  )
}

/** Rol distinto de owner/root/super-administrador (regla 8). */
export function tenantBillingForbiddenRoleError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.FORBIDDEN_ROLE)
}

/** Empresa activa del tenant no resuelta en el contexto de la request. */
export function tenantBillingBusinessUnitNotFoundError(
  detailOverride?: string
): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.BUSINESS_UNIT_NOT_FOUND, detailOverride)
}

/** Colisión de alta simultánea del perfil (UNIQUE business_unit + is_active). */
export function tenantBillingProfileConflictError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.PROFILE_CONFLICT)
}

/** Convierte una definición del catálogo en excepción de dominio. */
export function tenantBillingProfileErrorFromDefinition(
  definition: TenantBillingProfileErrorDefinition,
  detailOverride?: string
): TenantBillingProfileServiceError {
  return toServiceError(definition, detailOverride)
}

/** Clave de régimen fiscal fuera del catálogo sembrado (regla 2). */
export function tenantBillingTaxRegimeUnknownError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.TAX_REGIME_UNKNOWN)
}

/** Régimen fiscal incompatible con el tipo de persona del RFC (regla 3). */
export function tenantBillingTaxRegimeNotForPersonTypeError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.TAX_REGIME_NOT_FOR_PERSON_TYPE)
}

/** Clave de uso de CFDI fuera del catálogo sembrado (regla 4). */
export function tenantBillingCfdiUseUnknownError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.CFDI_USE_UNKNOWN)
}

/** Uso de CFDI incompatible con el régimen fiscal elegido (regla 4). */
export function tenantBillingCfdiUseNotForRegimeError(): TenantBillingProfileServiceError {
  return toServiceError(TENANT_BILLING_PROFILE_ERRORS.CFDI_USE_NOT_FOR_REGIME)
}
