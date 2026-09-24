/**
 * Códigos estables para rechazo de identidad duplicada por empresa (USRH1789698261610).
 * Prefijo PERSON.IDENTITY. El status conserva el 422 que personas ya responde hoy
 * en duplicados (el backoffice tiene su rama sobre ese status); solo el cuerpo
 * cambia al formato del equipo. Sin-empresa es 400, como el header requerido.
 */
export const PERSON_IDENTITY_ERROR_CODES = {
  /** El RFC ya lo usa otro expediente vivo de la misma empresa. */
  DUPLICATED_RFC: 'PERSON.IDENTITY.001',
  /** La CURP ya la usa otro expediente vivo de la misma empresa. */
  DUPLICATED_CURP: 'PERSON.IDENTITY.002',
  /** El NSS ya lo usa otro expediente vivo de la misma empresa. */
  DUPLICATED_NSS: 'PERSON.IDENTITY.003',
  /** La operación llegó sin la empresa desde la que se trabaja. */
  MISSING_COMPANY: 'PERSON.IDENTITY.004',
} as const

export type PersonIdentityErrorCode =
  (typeof PERSON_IDENTITY_ERROR_CODES)[keyof typeof PERSON_IDENTITY_ERROR_CODES]

export type PersonIdentityErrorDefinition = {
  key: string
  code: PersonIdentityErrorCode
  status: number
}

export const PERSON_IDENTITY_ERRORS: Record<
  'DUPLICATED_RFC' | 'DUPLICATED_CURP' | 'DUPLICATED_NSS' | 'MISSING_COMPANY',
  PersonIdentityErrorDefinition
> = {
  DUPLICATED_RFC: { key: 'rfc-ya-registrado-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_RFC, status: 422 },
  DUPLICATED_CURP: { key: 'curp-ya-registrada-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_CURP, status: 422 },
  DUPLICATED_NSS: { key: 'nss-ya-registrado-en-la-empresa', code: PERSON_IDENTITY_ERROR_CODES.DUPLICATED_NSS, status: 422 },
  MISSING_COMPANY: { key: 'empresa-de-trabajo-requerida', code: PERSON_IDENTITY_ERROR_CODES.MISSING_COMPANY, status: 400 },
}

export type PersonIdentityField = 'curp' | 'rfc' | 'nss'
