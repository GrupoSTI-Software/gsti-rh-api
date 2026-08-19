import vine from '@vinejs/vine'
import { rfcSatOptionalNullableField } from '../shared/validators/rfc.validator.js'

/**
 * Validador del upsert del perfil de facturación del tenant (USRH1786737531057).
 * Política RFC: forma SAT + dígito verificador solo cuando `rfc` no es `null`.
 */
export const tenantBillingProfileUpsertValidator = vine.compile(
  vine.object({
    legalName: vine.string().trim().minLength(1).maxLength(250),
    rfc: rfcSatOptionalNullableField,
  })
)
