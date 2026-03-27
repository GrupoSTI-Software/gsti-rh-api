import vine from '@vinejs/vine'

export const createPositionKpiValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    positionKpiName: vine.string().minLength(1),
    positionKpiMin: vine.number().min(1).optional(),
    positionKpiMax: vine.number().min(1).optional(),
    positionKpiIdeal: vine.string().minLength(1),
    positionKpiScale: vine.enum(['mayor es mejor', 'menor es mejor', 'si', 'no']),
    positionKpiType: vine.enum(['numérico', 'porcentaje', 'dinero', 'booleano']),
    positionKpiFrequency: vine.enum(['diario', 'semanal', 'cada 2 semanas', 'mensual', 'trimestral', 'semestral', 'anual']),
    positionKpiDurationDays: vine.number().min(1),
    positionKpiStartDay: vine.number().min(1),
  })
)

export const updatePositionKpiValidator = vine.compile(
  vine.object({
    positionKpiId: vine.number().min(1),
    positionKpiName: vine.string().minLength(1),
    positionKpiType: vine.enum(['numérico', 'porcentaje', 'dinero', 'booleano']),
    positionKpiMin: vine.number().min(1).optional(),
    positionKpiMax: vine.number().min(1).optional(),
    positionKpiIdeal: vine.string().minLength(1),
    positionKpiScale: vine.enum(['mayor es mejor', 'menor es mejor', 'si', 'no']),
    positionKpiFrequency: vine.enum(['diario', 'semanal', 'cada 2 semanas', 'mensual', 'trimestral', 'semestral', 'anual']),
    positionKpiDurationDays: vine.number().min(1),
    positionKpiStartDay: vine.number().min(1),
  })
)