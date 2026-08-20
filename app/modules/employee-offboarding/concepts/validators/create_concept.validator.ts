import vine from '@vinejs/vine'

/** Nombre del concepto: 1..150, único por empresa (la unicidad vive en el servicio). */
export const offboardingConceptNameField = vine.string().trim().minLength(1).maxLength(150)

/** Descripción opcional: hasta 500 caracteres; `null` la limpia. */
export const offboardingConceptDescriptionField = vine
  .string()
  .trim()
  .minLength(0)
  .maxLength(500)

/**
 * Alta de un concepto manual (USRH1786568279581). `offboardingConceptSource`
 * NO se acepta: todo concepto creado por el usuario nace 'manual'; el
 * derivado del inventario solo nace en la siembra (CA-6).
 */
export const createOffboardingConceptValidator = vine.compile(
  vine.object({
    offboardingConceptName: offboardingConceptNameField,
    offboardingConceptDescription: offboardingConceptDescriptionField.nullable().optional(),
    offboardingConceptRequiresEvidence: vine.boolean().optional(),
    offboardingConceptAllowsAmount: vine.boolean().optional(),
  })
)
