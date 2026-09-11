import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isAdmsChannelUrl } from '#constants/adms_channel'
import AdmsChannelGateway from '#modules/adms/channel/adms_channel.gateway'

/**
 * Middleware de SERVIDOR (spec v2, 4.1): intercepta todo `/iclock/*` antes del
 * router, para que el canal del checador nunca atraviese bodyparser, sesion,
 * deteccion de idioma ni `force_json_response`. No llama `next()` para el canal.
 */
export default class AdmsGatewayMiddleware {
  private readonly gateway = new AdmsChannelGateway()

  async handle(ctx: HttpContext, next: NextFn) {
    if (!isAdmsChannelUrl(ctx.request.url(false))) return next()
    await this.gateway.dispatch(ctx)
  }
}
