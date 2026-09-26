import vine from '@vinejs/vine'
import { rfcSatField } from '../../../../shared/validators/rfc.validator.js'
import {
  folioField,
  objetoRegistradoField,
  periodicidadMesesField,
  positiveIdField,
  razonSocialField,
} from './create_provider.validator.js'

/** Edición parcial: cualquier subconjunto de campos es válido. */
export const updateProveedorRepseValidator = vine.compile(
  vine.object({
    businessUnitId: positiveIdField.optional(),
    razonSocial: razonSocialField.optional(),
    rfc: rfcSatField.optional(),
    folio: folioField.optional(),
    objetoRegistrado: objetoRegistradoField.optional(),
    folioVencimiento: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    periodicidadMeses: periodicidadMesesField.optional(),
  })
)
