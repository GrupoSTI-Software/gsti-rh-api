import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import ApiToken from '#models/api_token'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

const FORBIDDEN_RESPONSE = {
  title: 'Acceso restringido a plataforma',
  detail: 'Esta sección es exclusiva de administradores de plataforma.',
  key: 'AUTH.PLATFORM.FORBIDDEN',
} as const

/**
 * Guard de plataforma: permite el paso únicamente a usuarios con
 * `is_platform_admin = 1` y sesión emitida por el login de la consola (`origin = 'platform'`).
 * Debe colocarse después del middleware `auth`.
 *
 * Fail-closed: ante cualquier duda (sin usuario, sin marcador, token de BO/app) responde 403.
 * Contrato de error: `{ title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }`.
 */
export default class PlatformAdminMiddleware {
  async handle({ auth, response }: HttpContext, next: NextFn) {
    const user = auth.user

    if (!user?.isPlatformAdmin) {
      return response.status(403).json(FORBIDDEN_RESPONSE)
    }

    const identifier = user.currentAccessToken?.identifier
    if (identifier === undefined || identifier === null) {
      return response.status(403).json(FORBIDDEN_RESPONSE)
    }

    const apiTokenRow = await ApiToken.query().where('id', String(identifier)).first()
    if (apiTokenRow?.origin !== 'platform') {
      return response.status(403).json(FORBIDDEN_RESPONSE)
    }

    return TenantContext.runUnscoped(
      () => next(),
      TENANT_UNSCOPED_REASON.PLATFORM_ADMIN,
      `user:${user.userId}`
    )
  }
}
