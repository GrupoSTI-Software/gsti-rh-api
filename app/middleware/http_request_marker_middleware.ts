import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { HttpRequestMarker } from '#utils/http_request_marker'

/**
 * Marca toda petición HTTP como «dentro de una petición» (USRH1789600808831).
 * Debe registrarse en `server.use`, no en `router.use`.
 */
export default class HttpRequestMarkerMiddleware {
  async handle(_ctx: HttpContext, next: NextFn) {
    return HttpRequestMarker.run(() => next())
  }
}
