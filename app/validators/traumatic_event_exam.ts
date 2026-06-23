import vine from '@vinejs/vine'

const EXAM_TYPES = ['medical', 'psychological'] as const
const OUTCOMES = ['fit', 'needs_follow_up', 'referred'] as const

/**
 * Alta de un resultado de examen. El servidor asigna `capturedByUserId`.
 * `performedBy` es obligatorio (3-150) independientemente del tipo de examen.
 */
export const createTraumaticEventExamValidator = vine.compile(
  vine.object({
    traumaticEventExamType: vine.enum(EXAM_TYPES),
    traumaticEventExamPerformedAt: vine.date({ formats: ['YYYY-MM-DD'] }),
    traumaticEventExamPerformedBy: vine.string().trim().minLength(3).maxLength(150),
    traumaticEventExamOutcome: vine.enum(OUTCOMES),
    traumaticEventExamNotes: vine.string().trim().maxLength(500).optional(),
  })
)

/**
 * Edición parcial. Cualquier subconjunto de campos editables es válido.
 * El capturador no se modifica.
 */
export const updateTraumaticEventExamValidator = vine.compile(
  vine.object({
    traumaticEventExamType: vine.enum(EXAM_TYPES).optional(),
    traumaticEventExamPerformedAt: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    traumaticEventExamPerformedBy: vine.string().trim().minLength(3).maxLength(150).optional(),
    traumaticEventExamOutcome: vine.enum(OUTCOMES).optional(),
    traumaticEventExamNotes: vine.string().trim().maxLength(500).nullable().optional(),
  })
)
