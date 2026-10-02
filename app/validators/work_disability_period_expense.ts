import vine from '@vinejs/vine'

export const createWorkDisabilityPeriodExpenseValidator = vine.compile(
  vine.object({
    workDisabilityPeriodExpenseAmount: vine.number(),
    workDisabilityPeriodId: vine.number().min(1),
    /** Qué se pagó; opcional para no romper altas anteriores a la columna. */
    workDisabilityPeriodExpenseConcept: vine.string().trim().minLength(1).maxLength(150).optional(),
  })
)
