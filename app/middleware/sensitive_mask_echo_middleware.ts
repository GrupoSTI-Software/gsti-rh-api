import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { neutralizeSensitiveMaskEchoInBody } from '#helpers/sensitive_mask_echo_body'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH'])

/**
 * Elimina del cuerpo las claves del catálogo sensible cuyo valor sea eco de máscara
 * y el usuario no tenga lectura de la categoría (USRH1787433076990).
 * Requiere `SensitiveAccessContext` abierto (businessScope o sensitiveAccess previo).
 */
export default class SensitiveMaskEchoMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    if (!WRITE_METHODS.has(request.method())) {
      return next()
    }

    const contentType = request.header('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      return next()
    }

    const body = request.body()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return next()
    }

    const neutralized = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
    if (neutralized !== body) {
      request.updateBody(neutralized)
    }

    return next()
  }
}
