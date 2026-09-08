import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import limiter from '@adonisjs/limiter/services/main'
import { ADMS_RATE } from '#modules/adms/adms.constants'
import { TenantContext } from '#utils/tenant_context'
import AdmsChannelController, { type AdmsRequest } from './adms_channel.controller.js'
import AdmsDeviceResolverService from './adms_device_resolver.service.js'
import { sendText } from './adms_text_response.js'
import { describeError } from './error_summary.js'
import type { ChannelReply } from './adms_channel.service.js'

type HandlerName =
  | 'handshakeGet'
  | 'upload'
  | 'registry'
  | 'push'
  | 'getRequest'
  | 'ping'
  | 'deviceCmd'
  | 'unknownPost'

interface AdmsRoute {
  method: 'GET' | 'POST'
  path: string
  handler: HandlerName
  /** Cuenta contra el limite por serie ademas del limite por IP. */
  meteredByDevice: boolean
}

/** Tabla de rutas del canal (spec v2, 4.1). La foto por token llega en la rebanada 9. */
export const ADMS_ROUTES: readonly AdmsRoute[] = [
  { method: 'GET', path: '/iclock/cdata', handler: 'handshakeGet', meteredByDevice: true },
  { method: 'POST', path: '/iclock/cdata', handler: 'upload', meteredByDevice: true },
  { method: 'POST', path: '/iclock/registry', handler: 'registry', meteredByDevice: true },
  { method: 'POST', path: '/iclock/push', handler: 'push', meteredByDevice: true },
  { method: 'GET', path: '/iclock/getrequest', handler: 'getRequest', meteredByDevice: true },
  { method: 'GET', path: '/iclock/ping', handler: 'ping', meteredByDevice: false },
  { method: 'POST', path: '/iclock/devicecmd', handler: 'deviceCmd', meteredByDevice: true },
]

const PHOTO_PATH_PATTERN = /\/doc\/biophoto\//i
const TOO_MANY_REQUESTS = 'TOO MANY REQUESTS'

export type AdmsRouteMatch = AdmsRoute | 'photo' | 'unknown_get' | 'unknown_post' | null

export function resolveAdmsRoute(method: string, path: string): AdmsRouteMatch {
  const normalized = path.replace(/\/+$/, '').toLowerCase()
  if (method === 'GET' && PHOTO_PATH_PATTERN.test(normalized)) return 'photo'
  const route = ADMS_ROUTES.find(
    (candidate) => candidate.method === method && candidate.path === normalized
  )
  if (route) return route
  if (method === 'GET') return 'unknown_get'
  if (method === 'POST') return 'unknown_post'
  return null
}

function parseQuery(ctx: HttpContext): Record<string, string> {
  const raw = ctx.request.qs() as Record<string, unknown>
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') query[key] = value
    else if (Array.isArray(value) && typeof value[0] === 'string') query[key] = value[0]
  }
  return query
}

function rawQueryOf(ctx: HttpContext): string | null {
  const full = ctx.request.url(true)
  const index = full.indexOf('?')
  return index >= 0 && index < full.length - 1 ? full.slice(index + 1) : null
}

/**
 * Resumen del error apto para la bitacora.
 *
 * Nunca se loguea el objeto de error completo: knex le cuelga `sql` y
 * `bindings`, asi que un fallo del INSERT del crudo escribiria el cuerpo
 * cifrado entero (hasta 4 MB, con templates biometricos) en el log
 * (spec 13, regla 7). Solo salen nombre, mensaje, codigo y pila.
 */
async function consumeOrReject(key: string, requests: number): Promise<boolean> {
  try {
    await limiter.use({ requests, duration: '1 minute' }).consume(key)
    return true
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'E_TOO_MANY_REQUESTS') return false
    throw error
  }
}

/**
 * Pasarela del canal ADMS (spec v2, 4.1): interceptada por el middleware de
 * servidor, resuelve el dispositivo, abre el scope de tenant, despacha al
 * controlador y responde siempre texto plano. Ninguna excepcion sale de aqui.
 */
export default class AdmsChannelGateway {
  constructor(
    private readonly controller: AdmsChannelController = new AdmsChannelController(),
    private readonly resolver: AdmsDeviceResolverService = new AdmsDeviceResolverService()
  ) {}

  async dispatch(ctx: HttpContext): Promise<void> {
    const method = ctx.request.method().toUpperCase()
    const path = ctx.request.url(false)
    const now = DateTime.utc()
    const ip = ctx.request.ip()

    try {
      if (!(await consumeOrReject(`adms-ip:${ip}`, ADMS_RATE.ipPerMinute))) {
        return sendText(ctx.response, 429, TOO_MANY_REQUESTS)
      }

      const route = resolveAdmsRoute(method, path)
      if (route === null || route === 'unknown_get') {
        return sendText(ctx.response, 404, 'NOT FOUND')
      }
      if (route === 'photo') {
        // Rebanada 9. Mientras no exista publicacion, 404: nunca un 200 generico.
        return sendText(ctx.response, 404, 'no existe')
      }

      const query = parseQuery(ctx)
      const resolution = await this.resolver.resolve({ serial: query.SN, ip, now, hints: null })
      if (resolution.kind === 'reject') {
        return sendText(ctx.response, resolution.status, resolution.body)
      }
      const { device } = resolution

      const metered = route === 'unknown_post' ? true : route.meteredByDevice
      if (
        metered &&
        !(await consumeOrReject(`adms-device:${device.serial}`, ADMS_RATE.devicePerMinute))
      ) {
        return sendText(ctx.response, 429, TOO_MANY_REQUESTS)
      }

      const request: AdmsRequest = {
        ctx,
        device,
        method,
        path,
        query,
        rawQuery: rawQueryOf(ctx),
      }
      const handler: HandlerName = route === 'unknown_post' ? 'unknownPost' : route.handler

      const reply = await TenantContext.run(
        [device.businessUnitId],
        async (): Promise<ChannelReply> => {
          await this.resolver.touch(device)
          return this.controller[handler](request)
        }
      )
      return sendText(ctx.response, reply.status, reply.body)
    } catch (error) {
      logger.error(
        { ...describeError(error), requestId: ctx.request.id(), path, method, ip },
        'canal ADMS: error no controlado; se responde 500 sin acuse'
      )
      if (!ctx.response.headersSent) sendText(ctx.response, 500, 'ERROR')
    }
  }
}
