import vine from '@vinejs/vine'
import { rfcSatOptionalNullableField } from '../shared/validators/rfc.validator.js'

/** CP fiscal: cinco dígitos; admite cero inicial (regla 1). */
const fiscalPostalCodeField = vine
  .string()
  .trim()
  .regex(/^\d{5}$/)
  .optional()
  .nullable()

/** Clave c_RegimenFiscal del catálogo sembrado (regla 2). */
const taxRegimeCodeField = vine.string().trim().maxLength(3).optional().nullable()

/** Correo de contacto fiscal; solo forma, sin envíos (regla 6). */
const billingEmailField = vine.string().trim().email().maxLength(191).optional().nullable()

/** Clave c_UsoCFDI del catálogo sembrado (regla 4). */
const cfdiUseCodeField = vine.string().trim().maxLength(4).optional().nullable()

/**
 * Validador del upsert del perfil de facturación del tenant (USRH1786737531057, USRH1786737531066).
 * Política RFC: forma SAT + dígito verificador solo cuando `rfc` no es `null`.
 */
export const tenantBillingProfileUpsertValidator = vine.compile(
  vine.object({
    legalName: vine.string().trim().minLength(1).maxLength(250),
    rfc: rfcSatOptionalNullableField,
    postalCode: fiscalPostalCodeField,
    taxRegimeCode: taxRegimeCodeField,
    billingEmail: billingEmailField,
    cfdiUseCode: cfdiUseCodeField,
  })
)
