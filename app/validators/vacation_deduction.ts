import vine from '@vinejs/vine'

export const createVacationDeductionValidator = vine.compile(
  vine.object({
    vacationSettingId: vine.number().min(1),
    vacationDeductionDays: vine.number().min(1),
    vacationDeductionDescription: vine.string().trim().nullable().optional(),
  })
)
