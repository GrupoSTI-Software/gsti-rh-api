import vine from '@vinejs/vine'

export const createPositionApprovalHistoryValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    positionApprovalHistoryDate: vine.string().minLength(10),
  })
)
