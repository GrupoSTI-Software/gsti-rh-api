import vine from '@vinejs/vine'
import { ASSET_CHARACTERISTIC_TYPES } from '#modules/assets/assets.constants'

export const createSupplieCaracteristicValidator = vine.compile(
  vine.object({
    supplyTypeId: vine.number().positive(),
    supplieCaracteristicName: vine.string().trim().minLength(1).maxLength(255),
    supplieCaracteristicType: vine.enum(ASSET_CHARACTERISTIC_TYPES),
  })
)

export const updateSupplieCaracteristicValidator = vine.compile(
  vine.object({
    supplyTypeId: vine.number().positive().optional(),
    supplieCaracteristicName: vine.string().trim().minLength(1).maxLength(255).optional(),
    supplieCaracteristicType: vine.enum(ASSET_CHARACTERISTIC_TYPES).optional(),
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
