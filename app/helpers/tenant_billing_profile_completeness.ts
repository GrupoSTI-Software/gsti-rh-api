/**
 * Campos obligatorios para considerar el perfil fiscal listo para facturar (regla 8).
 * `billingEmail` no forma parte de la completitud.
 */
export type BillingProfileMissingField =
  | 'rfc'
  | 'legalName'
  | 'postalCode'
  | 'taxRegimeCode'
  | 'cfdiUseCode'

/** Entrada mínima para evaluar completitud; alinea con `TenantBillingProfileView` (USRH1786737531066). */
export interface BillingProfileCompletenessInput {
  rfc: string | null
  legalName: string
  postalCode: string | null
  taxRegimeCode: string | null
  cfdiUseCode: string | null
}

const REQUIRED_FIELDS: readonly {
  key: BillingProfileMissingField
  isPresent: (profile: BillingProfileCompletenessInput) => boolean
}[] = [
  { key: 'rfc', isPresent: (profile) => isNonEmptyString(profile.rfc) },
  { key: 'legalName', isPresent: (profile) => isNonEmptyString(profile.legalName) },
  { key: 'postalCode', isPresent: (profile) => isNonEmptyString(profile.postalCode) },
  { key: 'taxRegimeCode', isPresent: (profile) => isNonEmptyString(profile.taxRegimeCode) },
  { key: 'cfdiUseCode', isPresent: (profile) => isNonEmptyString(profile.cfdiUseCode) },
]

function isNonEmptyString(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim().length > 0
}

/**
 * Calcula si el perfil fiscal está completo para facturar y qué campos faltan.
 * Regla única reutilizable por tenant y landlord (regla 8).
 */
export function computeBillingProfileCompleteness(
  profile: BillingProfileCompletenessInput
): { complete: boolean; missingFields: BillingProfileMissingField[] } {
  const missingFields = REQUIRED_FIELDS.filter(({ isPresent }) => !isPresent(profile)).map(
    ({ key }) => key
  )

  return {
    complete: missingFields.length === 0,
    missingFields,
  }
}
