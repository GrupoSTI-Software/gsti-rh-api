import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Guard de plataforma: permite el paso únicamente a usuarios con
 * `is_platform_admin = 1`. Debe colocarse después del middleware `auth`.
 *
 * Fail-closed: ante cualquier duda (sin usuario, sin marcador) responde 403.
 * Contrato de error: `{ title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }`.
 */
export default class PlatformAdminMiddleware {
  async handle({ auth, response }: HttpContext, next: NextFn) {
    const user = auth.user

    if (!user?.isPlatformAdmin) {
      return response.status(403).json({
        title: 'Acceso restringido a plataforma',
        detail: 'Esta sección es exclusiva de administradores de plataforma.',
        key: 'AUTH.PLATFORM.FORBIDDEN',
      })
    }

    return next()
  }
}
