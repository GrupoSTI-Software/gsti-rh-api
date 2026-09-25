import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import ApiToken from '#models/api_token'
import User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import Ws from '#services/ws'
import UserService from '#services/user_service'

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
  let notified = true
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
    await sendCredentialChangedMails(params)
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

/**
 * Task 4 completa los envíos manteniendo esta frontera post-commit.
 */
async function sendCredentialChangedMails(_params: NotifyAndAuditParams): Promise<void> {}

async function writeCredentialChangeLog(params: NotifyAndAuditParams): Promise<void> {
  const userService = Object.create(UserService.prototype) as UserService
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
