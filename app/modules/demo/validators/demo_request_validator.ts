import vine from '@vinejs/vine'

export const demoRequestValidator = vine.compile(
  vine.object({
    password: vine.string().minLength(1).maxLength(128),
  })
)
