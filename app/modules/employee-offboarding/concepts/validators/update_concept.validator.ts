import vine from '@vinejs/vine'
import {
  offboardingConceptDescriptionField,
  offboardingConceptNameField,
} from './create_concept.validator.js'

/**
 * Edición de un concepto (USRH1786568279581): nombre requerido; descripción,
 * exigencia de comprobante y admisión de importe opcionales con el valor
 * vigente como default (lo resuelve el servicio). `offboardingConceptSource`
 * no se acepta: la naturaleza del concepto no se cambia (regla 6).
 */
export const updateOffboardingConceptValidator = vine.compile(
  vine.object({
    offboardingConceptName: offboardingConceptNameField,
    offboardingConceptDescription: offboardingConceptDescriptionField.nullable().optional(),
    offboardingConceptRequiresEvidence: vine.boolean().optional(),
    offboardingConceptAllowsAmount: vine.boolean().optional(),
  })
)
