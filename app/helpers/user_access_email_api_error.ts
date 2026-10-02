import type { HttpContext } from '@adonisjs/core/http'
import { USER_ACCESS_EMAIL_ERRORS } from '#constants/user_access_email_error_codes'
import { EmailMirrorConflictError } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
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
    throw new UserAccessEmailMaskedError(USER_ACCESS_EMAIL_ERRORS.MASKED.code)
  }
}

export function isUserAccessEmailMaskedError(error: unknown): error is UserAccessEmailMaskedError {
  return error instanceof UserAccessEmailMaskedError
}

export function respondUserAccessEmailMasked(
  ctx: HttpContext,
  error: UserAccessEmailMaskedError
): UserAccessEmailErrorBody {
  ctx.response.status(USER_ACCESS_EMAIL_ERRORS.MASKED.status)

  return {
    title: ctx.i18n.t('user_access_email_masked_title'),
    detail: ctx.i18n.t('user_access_email_masked_detail'),
    key: USER_ACCESS_EMAIL_ERRORS.MASKED.key,
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
  ctx.response.status(USER_ACCESS_EMAIL_ERRORS.DUPLICATED.status)
  return {
    title: ctx.i18n.t('user_access_email_duplicated_title'),
    detail: ctx.i18n.t('user_access_email_duplicated_detail'),
    key: USER_ACCESS_EMAIL_ERRORS.DUPLICATED.key,
    code: USER_ACCESS_EMAIL_ERRORS.DUPLICATED.code,
  }
}

export function isEmailMirrorConflictError(error: unknown): error is EmailMirrorConflictError {
  return error instanceof EmailMirrorConflictError
}

/** Mismo destino ⇒ mismo cuerpo, venga del camino que venga (regla 5). */
export function respondEmailMirrorConflict(
  ctx: HttpContext,
  error: EmailMirrorConflictError
): UserAccessEmailErrorBody {
  if (error.target === 'users') return respondUserAccessEmailDuplicated(ctx)
  const isPerson = error.target === 'people'
  const definition = isPerson
    ? USER_ACCESS_EMAIL_ERRORS.MIRROR_PERSON_EMAIL_DUPLICATED
    : USER_ACCESS_EMAIL_ERRORS.MIRROR_EMPLOYEE_EMAIL_DUPLICATED
  const i18nPrefix = isPerson ? 'user_mirror_person_email_duplicated' : 'user_mirror_employee_email_duplicated'
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(`${i18nPrefix}_title`),
    detail: ctx.i18n.t(`${i18nPrefix}_detail`),
    key: definition.key,
    code: definition.code,
  }
}

export function isEmailMirrorRefusedError(error: unknown): error is EmailMirrorRefusedError {
  return error instanceof EmailMirrorRefusedError
}

/** Actor ausente y fuera de alcance comparten cuerpo: no se distingue por qué. */
export function respondEmailMirrorRefused(
  ctx: HttpContext,
  error: EmailMirrorRefusedError
): UserAccessEmailErrorBody {
  const isAmbiguous = error.reason === 'multiple-live-users'
  const definition = isAmbiguous
    ? USER_ACCESS_EMAIL_ERRORS.MIRROR_AMBIGUOUS_ACCOUNT
    : USER_ACCESS_EMAIL_ERRORS.MIRROR_TARGET_OUT_OF_SCOPE
  const i18nPrefix = isAmbiguous ? 'user_mirror_ambiguous_account' : 'user_mirror_target_out_of_scope'
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(`${i18nPrefix}_title`),
    detail: ctx.i18n.t(`${i18nPrefix}_detail`),
    key: definition.key,
    code: definition.code,
  }
}
