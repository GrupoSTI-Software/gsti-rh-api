import vine from '@vinejs/vine'

/** Query/body para `POST /api/platform/auth/recovery`. */
export const platformRecoveryRequestValidator = vine.compile(
  vine.object({
    userEmail: vine.string().trim().email().maxLength(200),
  })
)

/** Body para `POST /api/platform/auth/recovery/code-verify`. */
export const platformRecoveryCodeVerifyValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
    pinCode: vine.string().trim().fixedLength(6),
  })
)

/** Query/body para `POST /api/platform/auth/password/reset`. */
export const platformPasswordResetValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
    userPassword: vine.string().minLength(8).maxLength(255),
  })
)
