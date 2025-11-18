import vine from '@vinejs/vine'

export const createSupplyTypeValidator = vine.compile(
  vine.object({
    supplyTypeName: vine.string().trim().minLength(1).maxLength(255),
    supplyTypeDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeIdentifier: vine.string().trim().maxLength(100).optional(),
    supplyTypeSlug: vine.string().trim().minLength(1).maxLength(255),
  })
)

export const updateSupplyTypeValidator = vine.compile(
  vine.object({
    supplyTypeName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplyTypeDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeIdentifier: vine.string().trim().maxLength(100).optional(),
    supplyTypeSlug: vine.string().trim().minLength(1).maxLength(255).optional(),
  })
)

export const supplyTypeFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    supplyTypeName: vine.string().trim().optional(),
    supplyTypeSlug: vine.string().trim().optional(),
  })
)
