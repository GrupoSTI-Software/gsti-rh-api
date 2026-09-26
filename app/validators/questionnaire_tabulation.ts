import vine from '@vinejs/vine'

export const questionnaireTabulationParamsValidator = vine.compile(
  vine.object({
    applicationId: vine.number().positive(),
  })
)
