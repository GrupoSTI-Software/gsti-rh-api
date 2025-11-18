import vine from '@vinejs/vine'

export const createSupplieCaracteristicValidator = vine.compile(
  vine.object({
    supplyTypeId: vine.number().positive(),
    supplieCaracteristicName: vine.string().trim().minLength(1).maxLength(255),
    supplieCaracteristicType: vine.enum(['text', 'number', 'date', 'boolean', 'radio', 'file']),
  })
)

export const updateSupplieCaracteristicValidator = vine.compile(
  vine.object({
    supplyTypeId: vine.number().positive().optional(),
    supplieCaracteristicName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplieCaracteristicType: vine.enum(['text', 'number', 'date', 'boolean', 'radio', 'file']).optional(),
  })
)

export const supplieCaracteristicFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    supplyTypeId: vine.number().positive().optional(),
    supplieCaracteristicName: vine.string().trim().optional(),
    supplieCaracteristicType: vine.string().trim().optional(),
  })
)
