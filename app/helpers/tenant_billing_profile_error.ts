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
