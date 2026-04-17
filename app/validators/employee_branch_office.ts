import vine from '@vinejs/vine'

export const assignEmployeeBranchOfficeValidator = vine.compile(
  vine.object({
    branchOfficeId: vine.number().positive(),
  })
)
