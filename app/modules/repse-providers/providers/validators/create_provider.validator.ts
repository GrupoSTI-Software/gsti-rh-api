import vine from '@vinejs/vine'
import { rfcSatField } from '../../../../shared/validators/rfc.validator.js'

/**
 * Folio REPSE del proveedor: cadena alfanumérica con guiones, máximo 50
 * caracteres. Mismo criterio que `repse_registration.ts` (validators legacy
 * del lado prestador) para mantener consistencia de contrato.
 */
export const folioField = vine
  .string()
  .trim()
  .minLength(1)
  .maxLength(50)
  .regex(/^[A-Za-z0-9-]+$/)

export const razonSocialField = vine.string().trim().minLength(1).maxLength(255)

export const objetoRegistradoField = vine.string().trim().minLength(1).maxLength(1000)

export const periodicidadMesesField = vine.number().min(1).max(60)

/** Identificador positivo estricto: `.min(1)` para descartar `0`. */
export const positiveIdField = vine.number().min(1)

export const createProveedorRepseValidator = vine.compile(
  vine.object({
    businessUnitId: positiveIdField,
    razonSocial: razonSocialField,
    rfc: rfcSatField,
    folio: folioField,
    objetoRegistrado: objetoRegistradoField,
    folioVencimiento: vine.date({ formats: ['YYYY-MM-DD'] }),
    periodicidadMeses: periodicidadMesesField.optional(),
  })
)
