import vine from '@vinejs/vine'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validador de creación de override de jornada.
 *
 * Solo valida tipos y formato. Las reglas de negocio (rango vs federal, cap de
 * sanidad, no-traslape) viven en el service/modelo porque requieren consultar la BD.
 * La obligatoriedad de `overrideJustification` cuando `exceedsFederalAck` es true
 * se valida en el controller.
 */
export const createOverrideValidator = vine.compile(
  vine.object({
    businessUnitId: vine.number().positive(),
    effectiveYear: vine.number().min(2000).max(2100),
    validFrom: vine.string().trim().regex(DATE_REGEX),
    validTo: vine.string().trim().regex(DATE_REGEX).nullable().optional(),
    maxWeeklyHours: vine.number().positive(),
    maxWeeklyOvertimeHours: vine.number().min(0),
    maxDailyOvertimeHours: vine.number().min(0),
    maxOvertimeDaysPerWeek: vine.number().min(0),
    dailyHoursDay: vine.number().min(0),
    dailyHoursNight: vine.number().min(0),
    dailyHoursMixed: vine.number().min(0),
    workDaysPerRestDay: vine.number().min(0),
    exceedsFederalAck: vine.boolean(),
    overrideJustification: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

export type CreateOverridePayload = Awaited<ReturnType<typeof createOverrideValidator.validate>>
