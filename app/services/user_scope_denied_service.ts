import ApiToken from '#models/api_token'
import User from '#models/user'
import Ws from '#services/ws'
import ScopeDeniedLogService, { type ScopeDeniedLogEntry } from '#services/scope_denied_log_service'

/**
 * Respuesta de seguridad ante intentos CRUD sobre usuarios fuera del scope del actor
 * (USRH1786736057519 / hardening anti-IDOR).
 *
 * Registra el intento, revoca tokens de sesión del actor y emite cierre forzado por
 * websocket — posible ataque de enumeración o escalada entre empresas.
 */
export default class UserScopeDeniedService {
  static async handleCrudDenied(
    entry: Omit<ScopeDeniedLogEntry, 'domain'>,
    actor: User | undefined | null
  ): Promise<void> {
    await ScopeDeniedLogService.log({
      domain: 'user',
      ...entry,
    })

    if (!actor?.userId || !actor.userEmail) {
      return
    }

    await ApiToken.query().where('tokenable_id', actor.userId).delete()

    if (Ws.io) {
      const email = actor.userEmail
      Ws.io.emit(`user-forze-logout:${email}`, {})
      Ws.io.emit(`user-forze-logout:${email}:web`, {})
      Ws.io.emit(`user-forze-logout:${email}:app`, {})
    }
  }
}
