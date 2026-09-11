import vine from '@vinejs/vine'
import { rfcSatOptionalNullableField } from '../shared/validators/rfc.validator.js'

/** CP fiscal: cinco dígitos; admite cero inicial. */
const fiscalPostalCodeField = vine
  .string()
  .trim()
  .regex(/^\d{5}$/)
  .optional()
  .nullable()

const taxRegimeCodeField = vine.string().trim().maxLength(3).optional().nullable()
const billingEmailField = vine.string().trim().email().maxLength(191).optional().nullable()
const cfdiUseCodeField = vine.string().trim().maxLength(4).optional().nullable()

/**
 * Body para `PUT /api/platform/alliances/:allianceId/billing-profile`.
 * `legalName` es el único obligatorio. Ausente = conserva; `null` = limpia.
 */
export const upsertAllianceBillingProfileValidator = vine.compile(
  vine.object({
    legalName: vine.string().trim().minLength(1).maxLength(250),
    rfc: rfcSatOptionalNullableField,
    postalCode: fiscalPostalCodeField,
    taxRegimeCode: taxRegimeCodeField,
    cfdiUseCode: cfdiUseCodeField,
    billingEmail: billingEmailField,
  })
)
