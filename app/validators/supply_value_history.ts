import vine from '@vinejs/vine'

export const createSupplyValueHistoryValidator = vine.compile(
  vine.object({
    supplyId: vine.number().positive(),
    supplyValueHistoryCost: vine.number().min(0),
    supplyValueHistoryCurrentValue: vine.number().min(0),
    supplyValueHistoryNotes: vine.string().trim().maxLength(1000).optional().nullable(),
  })
)

export const updateSupplyValueHistoryValidator = vine.compile(
  vine.object({
    supplyValueHistoryCost: vine.number().min(0).optional(),
    supplyValueHistoryCurrentValue: vine.number().min(0).optional(),
    supplyValueHistoryNotes: vine.string().trim().maxLength(1000).optional().nullable(),
  })
)

export const supplyValueHistoryFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100).optional(),
    supplyId: vine.number().positive().optional(),
  })
)
