import vine from '@vinejs/vine'

export const vacationDaysQueryValidator = vine.compile(
  vine.object({
    params: vine.object({ employeeId: vine.number().positive().withoutDecimals() }),
    vacationSettingId: vine.number().positive().withoutDecimals(),
    /** Año del aniversario que abre el periodo: de ahi sale su rango. */
    periodYear: vine.number().min(1900).max(3000).withoutDecimals(),
  })
)

export const cancelVacationDayValidator = vine.compile(
  vine.object({
    params: vine.object({
      employeeId: vine.number().positive().withoutDecimals(),
      shiftExceptionId: vine.number().positive().withoutDecimals(),
    }),
    reason: vine.string().trim().minLength(3).maxLength(500),
  })
)
