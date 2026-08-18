import vine from '@vinejs/vine'

/** Política alineada a `app/validators/signup.ts` (12 + mayúscula + número + símbolo). */
export const invitationSetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1).maxLength(150),
    userPassword: vine
      .string()
      .minLength(12)
      .regex(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$/),
    userPasswordConfirm: vine.string(),
  })
)
