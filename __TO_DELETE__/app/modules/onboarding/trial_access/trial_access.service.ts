import { DateTime } from 'luxon'
import env from '#start/env'
import User from '#models/user'
import ApiToken from '#models/api_token'

const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'
/**
 * TTL del acceso de prueba en segundos: 30 minutos.
 * El doble del magic link estándar (15 min) para dar margen al demo.
 */
const TRIAL_ACCESS_TTL_SECONDS = 60 * 30

export interface TrialAccessResult {
  trialUrl: string
  expiresAt: string
  expiresInSeconds: number
}

/**
 * Genera un magic link de acceso temporal para el usuario del empleado.
 *
 * Diferencia con `MagicLinkService.requestMagicLink`:
 *  - El admin lo solicita de forma autenticada (no self-service).
 *  - El token se devuelve en la respuesta HTTP en lugar de enviarse por correo.
 *  - El TTL es de 30 minutos (vs 15 del flujo estándar).
 *
 * La verificación reutiliza el endpoint existente `/auth/magic-link/verify`
 * sin ningún cambio en el backend.
 */
export default class TrialAccessService {
  /**
   * Genera un acceso temporal para el userId dado.
   * Lanza error si el usuario no existe o no está activo.
   */
  async generateTrialAccess(userId: number): Promise<TrialAccessResult> {
    const user = await User.query()
      .where('user_id', userId)
      .where('user_active', 1)
      .whereNull('user_deleted_at')
      .first()

    if (!user) {
      throw new Error('TRIAL.USER_NOT_FOUND')
    }

    // Invalida tokens de prueba previos del mismo usuario
    await ApiToken.query()
      .where('tokenable_id', user.userId)
      .where('type', 'magic_link')
      .delete()

    const magicToken = await User.magicLinkTokens.create(user, undefined, {
      expiresIn: TRIAL_ACCESS_TTL_SECONDS,
    })

    const tokenValue = magicToken.value!.release()
    const backofficeUrl = env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL
    const trialUrl = `${backofficeUrl.replace(/\/$/, '')}/auth/magic-link?token=${encodeURIComponent(tokenValue)}`

    const expiresAt = DateTime.now()
      .plus({ seconds: TRIAL_ACCESS_TTL_SECONDS })
      .toISO()!

    return { trialUrl, expiresAt, expiresInSeconds: TRIAL_ACCESS_TTL_SECONDS }
  }
}
