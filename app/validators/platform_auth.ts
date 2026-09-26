import vine from '@vinejs/vine'

/** Body para `POST /api/platform/auth/login`. */
export const platformLoginValidator = vine.compile(
  vine.object({
    userEmail: vine.string().trim().email().maxLength(200),
    userPassword: vine.string().minLength(1).maxLength(255),
  })
)

/** Body para `POST /api/platform/auth/refresh`. */
export const platformRefreshValidator = vine.compile(
  vine.object({
    refreshToken: vine.string().minLength(1),
  })
)
