import vine from '@vinejs/vine'

export const createPositionKpiValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    positionKpiName: vine.string().minLength(1),
    positionKpiMin: vine.number().min(0).optional(),
    positionKpiMax: vine.number().min(0).optional(),
    positionKpiIdeal: vine.string().minLength(1) || vine.number().min(1),
    positionKpiScale: vine.enum(['mayor-es-mejor', 'menor-es-mejor', 'si', 'no']),
    positionKpiType: vine.enum(['numerico', 'porcentaje', 'dinero', 'booleano']),
    positionKpiFrequency: vine.enum(['sin-especificar', 'diario', 'semanal', 'cada-2-semanas', 'mensual', 'trimestral', 'semestral', 'anual']),
  })
)

export const updatePositionKpiValidator = vine.compile(
  vine.object({
    positionKpiId: vine.number().min(1),
    positionKpiName: vine.string().minLength(1),
    positionKpiType: vine.enum(['numerico', 'porcentaje', 'dinero', 'booleano']),
    positionKpiMin: vine.number().min(0).optional(),
    positionKpiMax: vine.number().min(0).optional(),
    positionKpiIdeal: vine.string().minLength(1) || vine.number().min(1),
    positionKpiScale: vine.enum(['mayor-es-mejor', 'menor-es-mejor', 'si', 'no']),
    positionKpiFrequency: vine.enum(['sin-especificar', 'diario', 'semanal', 'cada-2-semanas', 'mensual', 'trimestral', 'semestral', 'anual']),
  })
)