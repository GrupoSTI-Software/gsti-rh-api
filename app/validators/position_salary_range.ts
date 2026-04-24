import vine from '@vinejs/vine'

export const createPositionSalaryRangeValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().min(1),
    positionId: vine.number().min(1),
    minSalaryDaily: vine.number().positive(),
    maxSalaryDaily: vine.number().positive(),
    validFrom: vine.date(),
    reason: vine.string().trim().maxLength(500).optional(),
  })
)

export const closePositionSalaryRangeValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().maxLength(500).optional(),
  })
)
