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

// Domicilio fiscal y representante legal (USRH1789097550393): texto libre,
// declarado por la empresa; los topes coinciden uno a uno con el ancho de columna.

/** Calle del domicilio fiscal (regla 1). */
const streetField = vine.string().trim().maxLength(150).optional().nullable()

/** Número exterior (regla 1). */
const exteriorNumberField = vine.string().trim().maxLength(20).optional().nullable()

/** Número interior (regla 1). */
const interiorNumberField = vine.string().trim().maxLength(20).optional().nullable()

/** Colonia (regla 1). */
const neighborhoodField = vine.string().trim().maxLength(150).optional().nullable()

/** Municipio o alcaldía (regla 1). */
const municipalityField = vine.string().trim().maxLength(150).optional().nullable()

/** Entidad federativa como texto libre, sin catálogo (regla 8). */
const stateField = vine.string().trim().maxLength(100).optional().nullable()

/** Nombre completo del representante legal (regla 2). */
const legalRepresentativeNameField = vine.string().trim().maxLength(200).optional().nullable()

/** Cargo con el que firma el representante legal (regla 2). */
const legalRepresentativeRoleField = vine.string().trim().maxLength(120).optional().nullable()

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
    street: streetField,
    exteriorNumber: exteriorNumberField,
    interiorNumber: interiorNumberField,
    neighborhood: neighborhoodField,
    municipality: municipalityField,
    state: stateField,
    legalRepresentativeName: legalRepresentativeNameField,
    legalRepresentativeRole: legalRepresentativeRoleField,
  })
)
