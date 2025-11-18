import vine from '@vinejs/vine'

export const uploadContractValidator = vine.compile(
  vine.object({
    employeeSupplyIds: vine.array(vine.number().positive()).minLength(1),
  })
)

export const contractFilterValidator = vine.compile(
  vine.object({
    page: vine.number().positive().optional(),
    limit: vine.number().positive().max(100000).optional(),
    employeeSupplyId: vine.number().positive().optional(),
    contractUuid: vine.string().trim().optional(),
  })
)

