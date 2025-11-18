import vine from '@vinejs/vine'

export const createEmployeeSupplieValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    supplyId: vine.number().positive(),
    employeeSupplyStatus: vine.enum(['active', 'retired', 'shipping']).optional(),
  })
)

export const updateEmployeeSupplieValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive().optional(),
    supplyId: vine.number().positive().optional(),
    employeeSupplyStatus: vine.enum(['active', 'retired', 'shipping']).optional(),
  })
)

export const employeeSupplieFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(1000).optional(),
    search: vine.string().trim().optional(),
    employeeId: vine.number().positive().optional(),
    supplyId: vine.number().positive().optional(),
    employeeSupplyStatus: vine.enum(['active', 'retired', 'shipping']).optional(),
    supplyTypeId: vine.number().positive().optional(),
  })
)

export const employeeSupplieRetirementValidator = vine.compile(
  vine.object({
    employeeSupplyRetirementReason: vine.string().trim().minLength(1).maxLength(500),
    employeeSupplyRetirementDate: vine.string().trim().optional(),
  })
)
