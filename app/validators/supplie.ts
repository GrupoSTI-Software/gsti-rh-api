import vine from '@vinejs/vine'

export const createSupplieValidator = vine.compile(
  vine.object({
    supplyFileNumber: vine.number().positive(),
    supplyName: vine.string().trim().minLength(1).maxLength(255),
    supplyDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeId: vine.number().positive(),
    supplyStatus: vine.enum(['active', 'inactive', 'lost', 'damaged']).optional(),
  })
)

export const updateSupplieValidator = vine.compile(
  vine.object({
    supplyFileNumber: vine.number().positive().optional(),
    supplyName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplyDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeId: vine.number().positive().optional(),
    supplyStatus: vine.enum(['active', 'inactive', 'lost', 'damaged']).optional(),
  })
)

export const supplieFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    supplyTypeId: vine.number().positive().optional(),
    supplyName: vine.string().trim().optional(),
    supplyStatus: vine.enum(['active', 'inactive', 'lost', 'damaged']).optional(),
    supplyFileNumber: vine.number().positive().optional(),
    includeDeleted: vine.boolean().optional(),
  })
)

export const supplieDeactivationValidator = vine.compile(
  vine.object({
    supplyDeactivationReason: vine.string().trim().minLength(1).maxLength(500),
    supplyDeactivationDate: vine.string().trim().optional(),
  })
)
