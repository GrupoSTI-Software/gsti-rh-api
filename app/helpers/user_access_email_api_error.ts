import type { HttpContext } from '@adonisjs/core/http'
import { USER_ACCESS_EMAIL_ERROR_CODES } from '#constants/user_access_email_error_codes'
import { UserAccessEmailMaskedError } from '#exceptions/user_access_email_masked_error'
import { MASK_CHAR } from '#helpers/sensitive_mask'

export type UserAccessEmailErrorBody = {
  title: string
  detail: string
  key: string
  code: string
}

export function assertUserAccessEmailNotMasked(value: unknown): void {
  if (typeof value === 'string' && value.includes(MASK_CHAR)) {
    throw new UserAccessEmailMaskedError(USER_ACCESS_EMAIL_ERROR_CODES.MASKED)
  }
}

export function isUserAccessEmailMaskedError(error: unknown): error is UserAccessEmailMaskedError {
  return error instanceof UserAccessEmailMaskedError
}

export function respondUserAccessEmailMasked(
  ctx: HttpContext,
  error: UserAccessEmailMaskedError
): UserAccessEmailErrorBody {
  ctx.response.status(422)

  return {
    title: ctx.i18n.t('user_access_email_masked_title'),
    detail: ctx.i18n.t('user_access_email_masked_detail'),
    key: 'no-fue-posible-guardar-el-correo-de-acceso',
    code: error.errorCode,
  }
}
