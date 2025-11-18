import vine from '@vinejs/vine'

export const createSupplieCaracteristicValueValidator = vine.compile(
  vine.object({
    supplieCaracteristicId: vine.number().positive(),
    supplieId: vine.number().positive(),
    supplieCaracteristicValueValue: vine.any(),
  })
)

export const updateSupplieCaracteristicValueValidator = vine.compile(
  vine.object({
    supplieCaracteristicId: vine.number().positive().optional(),
    supplieId: vine.number().positive().optional(),
    supplieCaracteristicValueValue: vine.any().optional(),
  })
)

export const supplieCaracteristicValueFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    supplieCaracteristicId: vine.number().positive().optional(),
    supplieId: vine.number().positive().optional(),
    supplieCaracteristicValueValue: vine.string().trim().optional(),
  })
)
