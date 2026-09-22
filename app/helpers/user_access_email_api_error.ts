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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDuplicatedEmailValidationMessage(message: unknown): boolean {
  if (!isObjectRecord(message)) return false
  return (
    message.field === 'userEmail' &&
    typeof message.rule === 'string' &&
    message.rule.includes('unique')
  )
}

/** El .unique() inline de createUserValidator (validators/user.ts:21-27). Rule observado: 'database.unique' (ver Tarea 2 Step 1). */
export function isUserAccessEmailDuplicatedValidationError(error: unknown): boolean {
  if (!isObjectRecord(error)) return false
  if (error.code !== 'E_VALIDATION_ERROR') return false
  if (!Array.isArray(error.messages)) return false
  return error.messages.some((message) => isDuplicatedEmailValidationMessage(message))
}

/** La perdedora de una carrera entre dos altas concurrentes (CA-11): MySQL 1062 sobre el índice. */
export function isUserAccessEmailDuplicatedIndexError(error: unknown): boolean {
  if (!isObjectRecord(error)) return false
  if (error.code !== 'ER_DUP_ENTRY' && error.errno !== 1062) return false
  return typeof error.message === 'string' && error.message.includes('users_email_active_unique')
}

export function respondUserAccessEmailDuplicated(ctx: HttpContext): UserAccessEmailErrorBody {
  ctx.response.status(400)
  return {
    title: ctx.i18n.t('user_access_email_duplicated_title'),
    detail: ctx.i18n.t('user_access_email_duplicated_detail'),
    key: 'correo-de-acceso-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED,
  }
}
