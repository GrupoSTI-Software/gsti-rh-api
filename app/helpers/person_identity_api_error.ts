import type { HttpContext } from '@adonisjs/core/http'
import {
  PERSON_IDENTITY_ERRORS,
  type PersonIdentityField,
} from '#constants/person_identity_error_codes'

export type PersonIdentityErrorBody = {
  title: string
  detail: string
  key: string
  code: string
}

const VALIDATION_FIELD: Record<string, PersonIdentityField> = {
  personCurp: 'curp',
  personRfc: 'rfc',
  personImssNss: 'nss',
}

const INDEX_NAME: Record<PersonIdentityField, string> = {
  curp: 'people_curp_company_unique',
  nss: 'people_imss_nss_company_unique',
  rfc: 'people_rfc_company_unique',
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * El `.unique()` acotado por empresa de `validators/person.ts`. El correo no
 * aparece aquí a propósito: su unicidad sigue global y su mensaje es de otra
 * historia (regla 5).
 */
export function personIdentityDuplicatedFieldFromValidationError(
  error: unknown
): PersonIdentityField | null {
  if (!isObjectRecord(error)) return null
  if (error.code !== 'E_VALIDATION_ERROR') return null
  if (!Array.isArray(error.messages)) return null
  for (const message of error.messages) {
    if (!isObjectRecord(message)) continue
    const field = VALIDATION_FIELD[message.field as string]
    if (field && typeof message.rule === 'string' && message.rule.includes('unique')) {
      return field
    }
  }
  return null
}

/** La perdedora de una carrera entre dos altas concurrentes: MySQL 1062 sobre el UNIQUE compuesto. */
export function personIdentityDuplicatedIndexFromError(error: unknown): PersonIdentityField | null {
  if (!isObjectRecord(error)) return null
  if (error.code !== 'ER_DUP_ENTRY' && error.errno !== 1062) return null
  if (typeof error.message !== 'string') return null
  const message = error.message
  const found = (Object.keys(INDEX_NAME) as PersonIdentityField[]).find((field) =>
    message.includes(INDEX_NAME[field])
  )
  return found ?? null
}

/**
 * Mensaje de una fila fallida de la importación masiva. Un choque contra el
 * UNIQUE compuesto se informa como negocio; el texto crudo de MySQL trae la
 * huella de 64 hex y nunca llega al resultado.
 */
export function importRowErrorMessage(error: unknown): string {
  const racedField = personIdentityDuplicatedIndexFromError(error)
  if (racedField) return `${racedField.toUpperCase()} duplicado`
  return isObjectRecord(error) && typeof error.message === 'string' ? error.message : String(error)
}

const TITLE_KEY: Record<PersonIdentityField, string> = {
  curp: 'person_identity_duplicated_curp_title',
  nss: 'person_identity_duplicated_nss_title',
  rfc: 'person_identity_duplicated_rfc_title',
}

const DETAIL_KEY: Record<PersonIdentityField, string> = {
  curp: 'person_identity_duplicated_curp_detail',
  nss: 'person_identity_duplicated_nss_detail',
  rfc: 'person_identity_duplicated_rfc_detail',
}

const DEFINITION_KEY: Record<PersonIdentityField, 'DUPLICATED_CURP' | 'DUPLICATED_NSS' | 'DUPLICATED_RFC'> = {
  curp: 'DUPLICATED_CURP',
  nss: 'DUPLICATED_NSS',
  rfc: 'DUPLICATED_RFC',
}

/** Rechazo en términos de negocio: dice qué dato está repetido y nada más (regla 6). */
export function respondPersonIdentityDuplicated(
  ctx: HttpContext,
  field: PersonIdentityField
): PersonIdentityErrorBody {
  const definition = PERSON_IDENTITY_ERRORS[DEFINITION_KEY[field]]
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(TITLE_KEY[field]),
    detail: ctx.i18n.t(DETAIL_KEY[field]),
    key: definition.key,
    code: definition.code,
  }
}

/** Sin empresa no hay veredicto sobre duplicados (regla 10). */
export function respondPersonIdentityMissingCompany(ctx: HttpContext): PersonIdentityErrorBody {
  const definition = PERSON_IDENTITY_ERRORS.MISSING_COMPANY
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t('person_identity_missing_company_title'),
    detail: ctx.i18n.t('person_identity_missing_company_detail'),
    key: definition.key,
    code: definition.code,
  }
}
