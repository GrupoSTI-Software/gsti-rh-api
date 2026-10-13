import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import AdmsChannelGateway, {
  ADMS_ROUTES,
  resolveAdmsRoute,
} from '#modules/adms/channel/adms_channel.gateway'
import type AdmsChannelController from '#modules/adms/channel/adms_channel.controller'
import type { AdmsRequest } from '#modules/adms/channel/adms_channel.controller'
import type AdmsDeviceResolverService from '#modules/adms/channel/adms_device_resolver.service'
import type {
  DeviceResolution,
  ResolvedAdmsDevice,
} from '#modules/adms/channel/adms_device_resolver.service'
import type PhotoDownloadService from '#modules/biometric-vault/photo/photo_download.service'
import type { PhotoDownloadOutcome } from '#modules/biometric-vault/photo/photo_download.service'
import { ADMS_RATE } from '#modules/adms/adms.constants'
import { TenantContext } from '#utils/tenant_context'

const NOW = DateTime.fromISO('2026-10-12T15:00:00Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 32,
  businessUnitId: 7,
  serial: 'TEST-GW-0001',
  ip: '10.0.0.9',
  timezone: 'America/Mexico_City',
  receivedAt: NOW,
  configuredAt: null,
}

/** Lo que la pasarela dejo en la respuesta. */
interface Sent {
  status: number | null
  headers: Record<string, string>
  body: string | null
  streamed: boolean
}

/**
 * `HttpContext` minimo: solo lo que la pasarela lee y escribe. La pasarela no
 * usa nada mas del contexto, y un contexto real exigiria levantar el servidor.
 */
function makeCtx(input: {
  method: string
  path: string
  ip?: string
  query?: Record<string, string | string[]>
  host?: string | null
}): { ctx: HttpContext; sent: Sent } {
  const sent: Sent = { status: null, headers: {}, body: null, streamed: false }
  const query = input.query ?? {}
  const rawQuery = Object.entries(query)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value[0] : value}`)
    .join('&')

  const request = {
    method: () => input.method,
    url: (withQuery?: boolean) =>
      withQuery && rawQuery.length > 0 ? `${input.path}?${rawQuery}` : input.path,
    ip: () => input.ip ?? '203.0.113.5',
    qs: () => query,
    header: (name: string) => (name === 'host' ? (input.host ?? null) : null),
    id: () => 'req-test',
  }
  const response = {
    headersSent: false,
    status(code: number) {
      sent.status = code
      return response
    },
    header(name: string, value: string) {
      sent.headers[name] = value
      return response
    },
    send(body: string) {
      sent.body = body
    },
    stream() {
      sent.streamed = true
    },
  }
  return { ctx: { request, response } as unknown as HttpContext, sent }
}

interface Options {
  resolution?: DeviceResolution
  hotSession?: boolean
  reply?: { status: number; body: string }
  controllerThrows?: boolean
  photo?: PhotoDownloadOutcome
}

function makeGateway(options: Options = {}) {
  const resolved: Array<{ serial: string | undefined; host: string | null }> = []
  const touched: ResolvedAdmsDevice[] = []
  const handled: Array<{ handler: string; request: AdmsRequest; scope: number[] }> = []
  const photoCalls: string[] = []
  const failedDownloads: Array<{ publicationId: number; reason: string }> = []

  const resolver = {
    async resolve(input: { serial?: string; host: string | null }) {
      resolved.push({ serial: input.serial, host: input.host })
      return options.resolution ?? { kind: 'ok', device: DEVICE }
    },
    async touch(device: ResolvedAdmsDevice) {
      touched.push(device)
      return { hotSession: options.hotSession ?? false }
    },
  } as unknown as AdmsDeviceResolverService

  const handlerOf =
    (handler: string) =>
    async (request: AdmsRequest): Promise<{ status: number; body: string }> => {
      if (options.controllerThrows) throw new Error('el controlador se cayo')
      // Se captura el scope en el momento del despacho: es lo que se quiere probar.
      handled.push({ handler, request, scope: TenantContext.getScope() })
      return options.reply ?? { status: 200, body: 'OK' }
    }
  const controller = {
    handshakeGet: handlerOf('handshakeGet'),
    upload: handlerOf('upload'),
    registry: handlerOf('registry'),
    push: handlerOf('push'),
    getRequest: handlerOf('getRequest'),
    ping: handlerOf('ping'),
    deviceCmd: handlerOf('deviceCmd'),
    unknownPost: handlerOf('unknownPost'),
  } as unknown as AdmsChannelController

  const photos = {
    async resolve(path: string) {
      photoCalls.push(path)
      return (
        options.photo ?? {
          kind: 'not_found',
          reason: 'token_unknown',
          publicationId: null,
          accessPointId: null,
        }
      )
    },
    async reportFailedDownload(publicationId: number, reason: string) {
      failedDownloads.push({ publicationId, reason })
    },
  } as unknown as PhotoDownloadService

  return {
    gateway: new AdmsChannelGateway(controller, resolver, photos),
    resolved,
    touched,
    handled,
    photoCalls,
    failedDownloads,
  }
}

/** Cada caso usa una IP propia: el limite por IP vive en memoria entre casos. */
let ipSeq = 0
function freshIp(): string {
  ipSeq += 1
  return `198.51.100.${ipSeq}`
}

test.group('Pasarela ADMS: tabla de rutas', () => {
  test('cada ruta declarada se resuelve por metodo y camino', ({ assert }) => {
    for (const route of ADMS_ROUTES) {
      assert.deepEqual(resolveAdmsRoute(route.method, route.path), route)
    }
  })

  test('el camino se normaliza: mayusculas y barra final no cambian la ruta', ({ assert }) => {
    assert.deepEqual(resolveAdmsRoute('GET', '/iclock/CDATA/'), ADMS_ROUTES[0])
  })

  test('la foto por token se reconoce por su camino, en cualquier capitalizacion', ({
    assert,
  }) => {
    assert.equal(resolveAdmsRoute('GET', '/iclock/doc/biophoto/abc/1042.jpg'), 'photo')
    assert.equal(resolveAdmsRoute('GET', '/iclock/DOC/BioPhoto/abc/1042.jpg'), 'photo')
    // Por POST no hay foto: es una ruta POST desconocida.
    assert.equal(resolveAdmsRoute('POST', '/iclock/doc/biophoto/abc/1042.jpg'), 'unknown_post')
  })

  test('lo que no esta en la tabla se clasifica por metodo', ({ assert }) => {
    assert.equal(resolveAdmsRoute('GET', '/iclock/otra'), 'unknown_get')
    assert.equal(resolveAdmsRoute('POST', '/iclock/otra'), 'unknown_post')
    assert.isNull(resolveAdmsRoute('PUT', '/iclock/cdata'))
    assert.isNull(resolveAdmsRoute('DELETE', '/iclock/cdata'))
  })
})

test.group('Pasarela ADMS: despacho', () => {
  test('un GET desconocido responde 404 en texto sin resolver el equipo', async ({ assert }) => {
    const { gateway, resolved } = makeGateway()
    const { ctx, sent } = makeCtx({ method: 'GET', path: '/iclock/nada', ip: freshIp() })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 404)
    assert.equal(sent.body, 'NOT FOUND')
    assert.equal(sent.headers['Content-Type'], 'text/plain; charset=utf-8')
    assert.equal(sent.headers['Cache-Control'], 'private, no-store')
    assert.lengthOf(resolved, 0)
  })

  test('un metodo que el canal no habla responde 404', async ({ assert }) => {
    const { gateway, resolved } = makeGateway()
    const { ctx, sent } = makeCtx({ method: 'PUT', path: '/iclock/cdata', ip: freshIp() })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 404)
    assert.lengthOf(resolved, 0)
  })

  test('el rechazo del resolutor se responde tal cual y no llega al controlador', async ({
    assert,
  }) => {
    const { gateway, handled, touched } = makeGateway({
      resolution: { kind: 'reject', status: 403, body: 'FORBIDDEN' },
    })
    const { ctx, sent } = makeCtx({
      method: 'GET',
      path: '/iclock/cdata',
      ip: freshIp(),
      query: { SN: 'DESCONOCIDA' },
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 403)
    assert.equal(sent.body, 'FORBIDDEN')
    assert.lengthOf(handled, 0)
    assert.lengthOf(touched, 0)
  })

  test('una ruta conocida se despacha a su handler dentro del scope de la empresa', async ({
    assert,
  }) => {
    const { gateway, resolved, touched, handled } = makeGateway({
      hotSession: true,
      reply: { status: 200, body: 'GET OPTION FROM: TEST-GW-0001' },
    })
    const { ctx, sent } = makeCtx({
      method: 'GET',
      path: '/iclock/cdata',
      ip: freshIp(),
      query: { SN: DEVICE.serial, options: 'all', pushver: ['3.0', '2.0'] },
      host: 'abc.checadores.ejemplo.mx',
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 200)
    assert.equal(sent.body, 'GET OPTION FROM: TEST-GW-0001')
    assert.deepEqual(resolved, [{ serial: DEVICE.serial, host: 'abc.checadores.ejemplo.mx' }])
    assert.deepEqual(touched, [DEVICE])

    assert.lengthOf(handled, 1)
    const [call] = handled
    assert.equal(call.handler, 'handshakeGet')
    assert.equal(call.request.device, DEVICE)
    assert.equal(call.request.method, 'GET')
    assert.equal(call.request.path, '/iclock/cdata')
    // La query se aplana: una lista se queda con su primer valor.
    assert.deepEqual(call.request.query, { SN: DEVICE.serial, options: 'all', pushver: '3.0' })
    assert.equal(call.request.rawQuery, `SN=${DEVICE.serial}&options=all&pushver=3.0`)
    // `hotSession` lo decide `touch`, no la pasarela.
    assert.isTrue(call.request.hotSession)
    // El handler corrio con la empresa del equipo abierta.
    assert.deepEqual(call.scope, [DEVICE.businessUnitId])
  })

  test('sin query, rawQuery es nulo', async ({ assert }) => {
    const { gateway, handled } = makeGateway()
    const { ctx } = makeCtx({ method: 'GET', path: '/iclock/ping', ip: freshIp() })
    await gateway.dispatch(ctx)

    assert.lengthOf(handled, 1)
    assert.isNull(handled[0].request.rawQuery)
    assert.deepEqual(handled[0].request.query, {})
  })

  test('un POST desconocido llega al controlador como tal', async ({ assert }) => {
    const { gateway, handled } = makeGateway()
    const { ctx, sent } = makeCtx({
      method: 'POST',
      path: '/iclock/loquesea',
      ip: freshIp(),
      query: { SN: DEVICE.serial },
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 200)
    assert.lengthOf(handled, 1)
    assert.equal(handled[0].handler, 'unknownPost')
  })

  /**
   * Ninguna excepcion sale de la pasarela: el equipo recibe un 500 en texto y
   * NO un acuse, para que reintente. Un JSON de error de Adonis lo romperia.
   */
  test('si el controlador se cae, responde 500 ERROR y no lanza', async ({ assert }) => {
    const { gateway } = makeGateway({ controllerThrows: true })
    const { ctx, sent } = makeCtx({
      method: 'POST',
      path: '/iclock/cdata',
      ip: freshIp(),
      query: { SN: DEVICE.serial },
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 500)
    assert.equal(sent.body, 'ERROR')
    assert.equal(sent.headers['Content-Type'], 'text/plain; charset=utf-8')
  })

  test('pasado el limite por IP responde 429 antes de resolver nada', async ({ assert }) => {
    const { gateway, resolved } = makeGateway()
    const ip = freshIp()

    for (let i = 0; i < ADMS_RATE.ipPerMinute; i += 1) {
      const { ctx, sent } = makeCtx({ method: 'GET', path: '/iclock/nada', ip })
      await gateway.dispatch(ctx)
      assert.equal(sent.status, 404)
    }

    const { ctx, sent } = makeCtx({
      method: 'GET',
      path: '/iclock/cdata',
      ip,
      query: { SN: DEVICE.serial },
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 429)
    assert.equal(sent.body, 'TOO MANY REQUESTS')
    assert.lengthOf(resolved, 0)
  })
})

test.group('Pasarela ADMS: foto por token', () => {
  /**
   * La descarga no trae `SN`: el firmware pide la URL tal cual se la dimos.
   * Exigir serie la rechazaria siempre, asi que la foto sale antes del resolutor.
   */
  test('la foto se sirve sin resolver el equipo', async ({ assert }) => {
    const { gateway, resolved, photoCalls } = makeGateway({
      photo: {
        kind: 'ok',
        stream: Readable.from(['jpg']),
        contentLength: 3,
        employeeId: 42,
        accessPointId: 32,
        businessUnitId: 7,
        publicationId: 9,
      },
    })
    const path = '/iclock/doc/biophoto/abcdef/1042.jpg'
    const { ctx, sent } = makeCtx({ method: 'GET', path, ip: freshIp() })
    await gateway.dispatch(ctx)

    assert.lengthOf(resolved, 0)
    assert.deepEqual(photoCalls, [path])
    assert.equal(sent.status, 200)
    assert.isTrue(sent.streamed)
    assert.equal(sent.headers['Content-Type'], 'image/jpeg')
    assert.equal(sent.headers['Content-Length'], '3')
    // Es la cara de una persona: ningun intermedio la guarda.
    assert.equal(sent.headers['Cache-Control'], 'private, no-store')
  })

  test('un token inventado responde 404 y no levanta incidente', async ({ assert }) => {
    const { gateway, failedDownloads } = makeGateway()
    const { ctx, sent } = makeCtx({
      method: 'GET',
      path: '/iclock/doc/biophoto/inventado/1.jpg',
      ip: freshIp(),
    })
    await gateway.dispatch(ctx)

    assert.equal(sent.status, 404)
    assert.equal(sent.body, 'NOT FOUND')
    assert.isFalse(sent.streamed)
    assert.lengthOf(failedDownloads, 0)
  })

  test('un token real que no se pudo servir responde 404 y lo reporta', async ({ assert }) => {
    const { gateway, failedDownloads } = makeGateway({
      photo: { kind: 'not_found', reason: 'object_missing', publicationId: 9, accessPointId: 32 },
    })
    const { ctx, sent } = makeCtx({
      method: 'GET',
      path: '/iclock/doc/biophoto/real/1042.jpg',
      ip: freshIp(),
    })
    await gateway.dispatch(ctx)

    // Desde fuera se ve igual que el inventado...
    assert.equal(sent.status, 404)
    assert.equal(sent.body, 'NOT FOUND')
    // ...pero por dentro el operador tiene que enterarse.
    assert.deepEqual(failedDownloads, [{ publicationId: 9, reason: 'object_missing' }])
  })
})
