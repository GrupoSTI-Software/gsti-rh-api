import vine from '@vinejs/vine'

/** Body para `POST /api/platform/auth/magic-link/request`. */
export const platformMagicLinkRequestValidator = vine.compile(
  vine.object({
    userEmail: vine.string().trim().email().maxLength(200),
  })
)

/** Body para `POST /api/platform/auth/magic-link/verify`. */
export const platformMagicLinkVerifyValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
  })
)
