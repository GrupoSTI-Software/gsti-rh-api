import vine from '@vinejs/vine'

export const createPositionWorkToolValidator = vine.compile(
  vine.object({
    positionId: vine.number().min(1),
    positionWorkToolName: vine.string().trim().minLength(1).maxLength(255),
  })
)
