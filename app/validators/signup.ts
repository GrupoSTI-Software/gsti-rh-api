import vine from '@vinejs/vine'
import { PASSWORD_COMPLEXITY_PATTERN, PASSWORD_MIN_LENGTH } from '#helpers/password_policy'

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
      .minLength(PASSWORD_MIN_LENGTH)
      .regex(PASSWORD_COMPLEXITY_PATTERN),
    passwordConfirm: vine.string(),
  })
)

export const startSignupValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().minLength(1).maxLength(100),
    lastName: vine.string().trim().minLength(1).maxLength(100),
    secondLastName: vine.string().trim().minLength(1).maxLength(100).optional(),
    businessUnitName: vine.string().trim().minLength(1).maxLength(200),
    email: vine.string().trim().email(),
    billingPlanId: vine.number().positive().withoutDecimals(),
    contractedEmployees: vine.number().positive().withoutDecimals(),
  })
)
