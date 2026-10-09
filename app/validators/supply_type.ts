import vine from '@vinejs/vine'
import { SUPPLY_TYPE_TELEWORK_CATEGORIES } from '#constants/supply_type_telework_category'

export const createSupplyTypeValidator = vine.compile(
  vine.object({
    supplyTypeName: vine.string().trim().minLength(1).maxLength(255),
    supplyTypeDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeIdentifier: vine.string().trim().maxLength(100).optional(),
    /** Opcional: si no llega, el service lo deriva del nombre (único por empresa). */
    supplyTypeSlug: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplyTypeTeleworkCategory: vine
      .enum(SUPPLY_TYPE_TELEWORK_CATEGORIES)
      .nullable()
      .optional(),
  })
)

export const updateSupplyTypeValidator = vine.compile(
  vine.object({
    supplyTypeName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplyTypeDescription: vine.string().trim().maxLength(1000).optional(),
    supplyTypeIdentifier: vine.string().trim().maxLength(100).optional(),
    supplyTypeSlug: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplyTypeTeleworkCategory: vine
      .enum(SUPPLY_TYPE_TELEWORK_CATEGORIES)
      .nullable()
      .optional(),
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
