import vine from '@vinejs/vine'

export const createdUserFcmTokenValidator = vine.compile(
  vine.object({
    userId: vine.number().min(1),
  })
)
