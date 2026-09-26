import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador de actualización parcial (PATCH) de un override.
 *
 * Todos los campos son opcionales; `businessUnitId` no se acepta (el override se
 * identifica por su id en la ruta). La obligatoriedad de la justificación cuando
 * `exceedsFederalAck` es true se valida en el controller.
 */
export const updateOverrideValidator = vine.compile(
  vine.object({
    effectiveYear: vine.number().min(2000).max(2100).optional(),
    validFrom: vine.string().trim().regex(DATE_REGEX).optional(),
    validTo: vine.string().trim().regex(DATE_REGEX).nullable().optional(),
    maxWeeklyHours: vine.number().positive().optional(),
    maxWeeklyOvertimeHours: vine.number().min(0).optional(),
    maxDailyOvertimeHours: vine.number().min(0).optional(),
    maxOvertimeDaysPerWeek: vine.number().min(0).optional(),
    dailyHoursDay: vine.number().min(0).optional(),
    dailyHoursNight: vine.number().min(0).optional(),
    dailyHoursMixed: vine.number().min(0).optional(),
    workDaysPerRestDay: vine.number().min(0).optional(),
    exceedsFederalAck: vine.boolean().optional(),
    overrideJustification: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export type UpdateOverridePayload = Awaited<ReturnType<typeof updateOverrideValidator.validate>>
