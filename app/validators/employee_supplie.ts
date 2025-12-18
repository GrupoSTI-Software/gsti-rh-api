import vine from '@vinejs/vine'

export const createEmployeeSupplieValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive(),
    supplyId: vine.number().positive(),
    employeeSupplyExpirationDate: vine.string().trim().optional(),
    employeeSupplyStatus: vine.enum(['active', 'retired', 'shipping']).optional(),
    employeeSupplyAdditions: vine.string().trim().optional(),
    employeeSupplyAssignamentDate: vine.string().trim(),
  })
)

export const updateEmployeeSupplieValidator = vine.compile(
  vine.object({
    employeeId: vine.number().positive().optional(),
    supplyId: vine.number().positive().optional(),
    employeeSupplyExpirationDate: vine
      .any()
      .nullable()
      .transform((value) => {
        if (value === null || value === '' || value === undefined) {
          return null
        }
        if (typeof value === 'string') {
          return value.trim() || null
        }
        return value
      })
      .optional(),
    employeeSupplyStatus: vine.enum(['active', 'retired', 'shipping']).optional(),
    employeeSupplyAdditions: vine.string().trim().optional(),
    employeeSupplyAssignamentDate: vine.string().trim().optional(),
  })
)

export const employeeSupplieFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(10000).optional(),
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
