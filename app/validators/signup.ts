import vine from '@vinejs/vine'

export const verifyOtpValidator = vine.compile(
  vine.object({
    signupDraftId: vine.number().min(1),
    pinCode: vine.string().trim().minLength(6).maxLength(6),
  })
)

export const completeSignupValidator = vine.compile(
  vine.object({
    signupDraftId: vine.number().min(1),
    signupToken: vine.string().trim().minLength(1),
    password: vine
      .string()
      .minLength(12)
      .regex(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$/),
    passwordConfirm: vine.string(),
  })
)

export const startSignupValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(1).maxLength(150),
    lastName: vine.string().trim().minLength(1).maxLength(150),
    secondLastName: vine.string().trim().maxLength(150).optional(),
    businessUnitName: vine.string().trim().minLength(1).maxLength(250),
    email: vine.string().trim().email().maxLength(200),
    password: vine
      .string()
      .minLength(12)
      .regex(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).+$/),
  })
)
