import vine from '@vinejs/vine'

/**
 * Tipos de institución admitidos (enum fijo; extensible sin cambiar el contrato).
 */
const INSTITUTION_TYPES = ['imss', 'company_doctor', 'private_clinic', 'other'] as const

/**
 * Alta de una canalización. El servidor asigna `capturedByUserId`.
 * `institutionName` es obligatorio (3-150) independientemente del tipo.
 */
export const createTraumaticEventReferralValidator = vine.compile(
  vine.object({
    traumaticEventReferralInstitutionType: vine.enum(INSTITUTION_TYPES),
    traumaticEventReferralInstitutionName: vine.string().trim().minLength(3).maxLength(150),
    traumaticEventReferralReferredAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    traumaticEventReferralNotes: vine.string().trim().maxLength(500).optional(),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos editables es válido.
 * El capturador no se modifica.
 */
export const updateTraumaticEventReferralValidator = vine.compile(
  vine.object({
    traumaticEventReferralInstitutionType: vine.enum(INSTITUTION_TYPES).optional(),
    traumaticEventReferralInstitutionName: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(150)
      .optional(),
    traumaticEventReferralReferredAt: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    traumaticEventReferralNotes: vine.string().trim().maxLength(500).nullable().optional(),
  })
)
