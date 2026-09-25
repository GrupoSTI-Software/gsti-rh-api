import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import i18nManager from '@adonisjs/i18n/services/main'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import ApiToken from '#models/api_token'
import User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import Ws from '#services/ws'
import UserService from '#services/user_service'
import CredentialChangedMail from '#mails/credential_changed_mail'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { MAIL_BRAND_LOGO_URL, MAIL_BRAND_TRADE_NAME } from '#constants/mail_branding'
import { resolveMailLocale } from '#constants/mail_locale'

export type CredentialChangeOrigin = 'person-file' | 'user-screen' | 'employee-file'

export interface RevokeSessionsParams {
  readonly affectedUserId: number
  readonly preservedTokenId: string | null
}

export interface NotifyAndAuditParams {
  readonly actorUserId: number
  readonly affectedUserId: number
  readonly origin: CredentialChangeOrigin
  readonly previousEmail: string
  readonly newEmail: string
  readonly userEmailType: UserEmailTypeValue
  readonly previousRecipients: readonly string[]
  readonly rawHeaders: string[]
  readonly revokedCount: number
}

/**
 * Revoca las sesiones y el material de recuperación dentro de la transacción
 * que persiste el cambio de credencial.
 */
export async function revokeSessions(
  trx: TransactionClientContract,
  params: RevokeSessionsParams
): Promise<number> {
  const query = ApiToken.query({ client: trx }).where('tokenable_id', params.affectedUserId)
  if (params.preservedTokenId !== null) {
    query.whereNot('id', params.preservedTokenId)
  }

  const revokedResult: unknown = await query.delete()
  const affected = await User.query({ client: trx })
    .where('user_id', params.affectedUserId)
    .firstOrFail()

  affected.userToken = ''
  affected.userTokenExpiresAt = null
  affected.pinCode = ''
  affected.pinCodeExpiresAt = null
  await affected.useTransaction(trx).save()

  return Array.isArray(revokedResult) ? revokedResult.length : Number(revokedResult)
}

/**
 * Ejecuta las consecuencias que ocurren después del commit. Cada integración
 * es de mejor esfuerzo para que una caída externa no convierta en error un
 * cambio de credencial que ya quedó confirmado.
 */
export async function notifyAndAudit(params: NotifyAndAuditParams): Promise<void> {
  let notified = false
  let logged = true

  try {
    if (Ws.io) {
      for (const channelEmail of [params.previousEmail, params.newEmail]) {
        Ws.io.emit(`user-forze-logout:${channelEmail}`, {})
        Ws.io.emit(`user-forze-logout:${channelEmail}:web`, {})
        Ws.io.emit(`user-forze-logout:${channelEmail}:app`, {})
      }
    }
  } catch {
    // El cambio ya fue confirmado; websocket no puede revertirlo.
  }

  try {
    notified = await sendCredentialChangedMails(params)
  } catch {
    notified = false
  }

  try {
    await writeCredentialChangeLog(params)
  } catch {
    logged = false
  }

  try {
    logger.info(
      {
        actorUserId: params.actorUserId,
        affectedUserId: params.affectedUserId,
        origin: params.origin,
        revoked: params.revokedCount,
        notified,
        logged,
      },
      'credential-change consequences'
    )
  } catch {
    // El contador también es de mejor esfuerzo y nunca incluye correos.
  }
}

async function sendCredentialChangedMails(params: NotifyAndAuditParams): Promise<boolean> {
  const from = resolveMailSender()
  const branding = {
    tradeName: MAIL_BRAND_TRADE_NAME,
    backgroundImageLogo: MAIL_BRAND_LOGO_URL,
  }
  const firstName = await resolveFirstName(params.affectedUserId)
  const changedAt = new Date().toISOString()
  const loginUrl = resolveLoginUrl(params.rawHeaders)
  // El destinatario no es quien hace la petición (lo edita un administrador) y
  // no hay idioma guardado por usuario: se decide en el punto único del producto.
  const language = resolveMailLocale()

  let attemptedCount = 0
  let allSucceeded = true

  for (const to of params.previousRecipients) {
    attemptedCount++
    try {
      await mail.send(
        new CredentialChangedMail({
          to,
          from,
          firstName,
          variant: 'previous',
          newEmailDisplay: maskEmail(params.newEmail),
          changedAt,
          loginUrl,
          language,
          branding,
        })
      )
    } catch (err) {
      allSucceeded = false
      try {
        logger.error(safeMailErrorInfo(err, to), 'credential-change previous mail failed')
      } catch {
        // Fallo de logger nunca interrumpe el ciclo ni relanza.
      }
    }
  }

  if (params.newEmail) {
    attemptedCount++
    try {
      await mail.send(
        new CredentialChangedMail({
          to: params.newEmail,
          from,
          firstName,
          variant: 'current',
          newEmailDisplay: params.newEmail,
          changedAt,
          loginUrl,
          language,
          branding,
        })
      )
    } catch (err) {
      allSucceeded = false
      try {
        logger.error(
          safeMailErrorInfo(err, params.newEmail),
          'credential-change current mail failed'
        )
      } catch {
        // Fallo de logger nunca interrumpe el ciclo ni relanza.
      }
    }
  }

  return attemptedCount > 0 && allSucceeded
}

function resolveLoginUrl(rawHeaders: string[]): string {
  const configured = env.get('APP_URL', '')
  const origin = createUserService().getHeaderValue(rawHeaders, 'Origin') ?? ''
  return (configured || origin).replace(/\/$/, '')
}

function createUserService(): UserService {
  return new UserService(i18nManager.locale(resolveMailLocale()))
}

async function resolveFirstName(userId: number): Promise<string> {
  try {
    const user = await User.query().where('user_id', userId).preload('person').first()
    return user?.person?.personFirstname?.trim() || ''
  } catch {
    return ''
  }
}

export function maskEmail(email: string): string {
  const atIndex = email.lastIndexOf('@')
  if (atIndex === -1) {
    return '•••'
  }
  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)
  if (!domain) {
    return '•••'
  }
  if (local.length < 2) {
    return `•••@${domain}`
  }
  return `${local[0]}•••${local[local.length - 1]}@${domain}`
}

function sanitizeErrorMessage(value: string): string {
  return value.replace(/[^\s@]+@[^\s@]+/g, '[redacted]')
}

function safeMailErrorInfo(err: unknown, to: string): Record<string, unknown> {
  const errorObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null
  const errName =
    errorObj && typeof errorObj.name === 'string' ? sanitizeErrorMessage(errorObj.name) : undefined
  const errCode =
    errorObj && errorObj.code !== undefined
      ? sanitizeErrorMessage(String(errorObj.code))
      : undefined
  const rawMessage =
    errorObj && errorObj.message !== undefined ? String(errorObj.message) : String(err ?? '')
  const errMsg = sanitizeErrorMessage(rawMessage)

  return {
    to: redactEmail(to),
    errName,
    errCode,
    errMsg,
  }
}

function redactEmail(value: string): string {
  if (!value || !value.includes('@')) {
    return '***'
  }
  const [, domain] = value.split('@')
  return `***@${domain}`
}

async function writeCredentialChangeLog(params: NotifyAndAuditParams): Promise<void> {
  const userService = createUserService()
  const logUser = userService.createActionLog(params.rawHeaders, 'credential-change')

  logUser.user_id = params.actorUserId
  logUser.record_previous = {
    user_id: params.affectedUserId,
    user_email: params.previousEmail,
    user_email_type: params.userEmailType,
  } as unknown as User
  logUser.record_current = {
    user_id: params.affectedUserId,
    user_email: params.newEmail,
    user_email_type: params.userEmailType,
    mirror_origin: params.origin,
  } as unknown as User

  await userService.saveActionOnLog(logUser)
}
