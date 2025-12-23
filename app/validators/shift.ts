import vine from '@vinejs/vine'

export const createShiftValidator = vine.compile(
  vine.object({
    shiftName: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(255),
    shiftTimeStart: vine.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    shiftActiveHours: vine.number().min(1).max(72),
    shiftActiveMinutes: vine.number().min(0).max(59).optional(),
    shiftRestDays: vine.string().transform((value) => {
      const restDaysArray = value.split(',').map(Number)
      if (!restDaysArray.every((day) => day >= 0 && day <= 15)) {
        throw new Error('Shift rest days must be between 0 and 15')
      }
      const uniqueDays = new Set(restDaysArray)
      if (uniqueDays.size !== restDaysArray.length) {
        throw new Error('Shift rest days must not contain duplicate values')
      }
      return value
    }),
    shiftAccumulatedFault: vine.number().min(1),
    shiftTemp: vine.number().optional(),
  })
)

export const updateShiftValidator = vine.compile(
    vine.object({
      shiftName: vine
        .string()
        .trim()
        .minLength(1)
        .maxLength(255),
      shiftTimeStart: vine.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
      shiftActiveHours: vine.number().min(1).max(72),
      shiftActiveMinutes: vine.number().min(0).max(59).optional(),
      shiftRestDays: vine.any().transform((value) => {
        const restDaysArray = value.split(',').map(Number)
        if (!restDaysArray.every((day: number) => day >= 0 && day <= 15)) {
          throw new Error('Shift rest days must be between 0 and 15')
        }
        const uniqueDays = new Set(restDaysArray)
        if (uniqueDays.size !== restDaysArray.length) {
          throw new Error('Shift rest days must not contain duplicate values')
        }
        return restDaysArray.join(',')
      }),
      shiftAccumulatedFault: vine.number().min(1),
      shiftTemp: vine.number().optional(),
    })
  )
