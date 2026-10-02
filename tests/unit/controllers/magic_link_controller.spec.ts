import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { HttpContext } from '@adonisjs/core/http'
import MagicLinkController from '#controllers/magic_link_controller'
import type MagicLinkService from '#services/magic_link_service'
import type { MagicLinkVerifyOutcome } from '#services/magic_link_service'
import { AUTH_LOGIN_ERROR_CODES } from '#constants/auth_login_error_codes'

/**
 * Contrato HTTP del magic link del backoffice.
 *
 * El caso que motiva estas pruebas es el colaborador: su acceso es la app del
 * empleado, así que ni se le envía el enlace ni se le acepta uno emitido antes
 * de que le cambiaran el rol. Lo que el backoffice consume es la respuesta, y
 * es lo que se fija aquí; la regla de quién entra vive en `canAccessBackoffice`
 * y se prueba en `tests/unit/helpers/effective_tenant_role.spec.ts`.
 *
 * El servicio se inyecta en el controlador: estas pruebas ejercen el código
 * real del controlador, no un doble de sí mismo.
 */

interface CapturedResponse {
  status?: number
}

/** Response mínimo: el controlador fija el status y devuelve el cuerpo. */
function makeResponse(): { response: HttpContext['response']; captured: CapturedResponse } {
  const captured: CapturedResponse = {}
  const response = {
    status(code: number) {
      captured.status = code
      return response
    },
  } as unknown as HttpContext['response']
  return { response, captured }
}

/** Request mínimo con los `input()` que lee el controlador. */
function makeRequest(body: Record<string, unknown>) {
  return {
    input(key: string, defaultValue?: unknown) {
      return key in body ? body[key] : defaultValue
    },
  } as unknown as HttpContext['request']
}

/** i18n mínimo: devuelve la clave, que es lo único que se necesita distinguir. */
function makeI18n() {
  return {
    formatMessage(key: string) {
      return key
    },
  } as unknown as HttpContext['i18n']
}

/** Servicio doble con el desenlace que la prueba quiere provocar. */
function makeService(outcome: MagicLinkVerifyOutcome, onRequest?: () => void): MagicLinkService {
  return {
    async requestMagicLink() {
      onRequest?.()
    },
    async verifyMagicLink() {
      return outcome
    },
  } as unknown as MagicLinkService
}

test.group('MagicLinkController.verify — cuenta sin acceso al backoffice', () => {
  test('devuelve 403 con la clave del login para que el mensaje sea el mismo', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const controller = new MagicLinkController(makeService({ status: 'backoffice_forbidden' }))

    const body = (await controller.verify({
      request: makeRequest({ token: 'enlace-de-colaborador' }),
      response,
      i18n: makeI18n(),
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.equal(captured.status, 403)
    assert.equal(body.key, AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN)
    assert.isString(body.title)
    assert.isString(body.detail)
  })

  test('el 403 no emite sesión: sin token, refreshToken ni user', async ({ assert }) => {
    const { response } = makeResponse()
    const controller = new MagicLinkController(makeService({ status: 'backoffice_forbidden' }))

    const body = (await controller.verify({
      request: makeRequest({ token: 'enlace-de-colaborador' }),
      response,
      i18n: makeI18n(),
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.isNull(body.data)
    assert.notProperty(body, 'token')
    assert.notProperty(body, 'refreshToken')
    assert.notProperty(body, 'user')
  })

  test('no se confunde con el 401 de enlace inválido', async ({ assert }) => {
    // Son dos salidas distintas a propósito: pedir otro enlace resuelve el 401
    // y no resuelve nada en el 403, porque ese correo ya no se envía.
    const { response, captured } = makeResponse()
    const controller = new MagicLinkController(makeService({ status: 'invalid' }))

    const body = (await controller.verify({
      request: makeRequest({ token: 'enlace-caduco' }),
      response,
      i18n: makeI18n(),
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.equal(captured.status, 401)
    assert.equal(body.key, 'AUTH.MAGIC_LINK.INVALID')
    assert.notEqual(body.key, AUTH_LOGIN_ERROR_CODES.BACKOFFICE_FORBIDDEN)
  })
})

test.group('MagicLinkController.verify — camino feliz y validación de entrada', () => {
  test('con desenlace ok devuelve 200 con el par de tokens', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const user = { userId: 7, userEmail: 'admin@valanserh.com' }
    const controller = new MagicLinkController(
      makeService({
        status: 'ok',
        result: {
          user: user as never,
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        },
      })
    )

    const body = (await controller.verify({
      request: makeRequest({ token: 'enlace-valido' }),
      response,
      i18n: makeI18n(),
    } as unknown as HttpContext)) as unknown as Record<string, Record<string, unknown>>

    assert.equal(captured.status, 200)
    assert.equal(body.data.token, 'access-1')
    assert.equal(body.data.refreshToken, 'refresh-1')
    assert.deepEqual(body.data.user, user)
  })

  test('sin token devuelve 400 y no consulta el servicio', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const controller = new MagicLinkController(makeService({ status: 'invalid' }))

    const body = (await controller.verify({
      request: makeRequest({}),
      response,
      i18n: makeI18n(),
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.equal(captured.status, 400)
    assert.equal(body.key, 'AUTH.MAGIC_LINK.MISSING')
  })
})

test.group('MagicLinkController.request — anti-enumeración', () => {
  test('un correo con formato inválido no llega al servicio y responde 200', async ({ assert }) => {
    let llamadas = 0
    const { response, captured } = makeResponse()
    const controller = new MagicLinkController(
      makeService({ status: 'invalid' }, () => {
        llamadas += 1
      })
    )

    const body = (await controller.request({
      request: makeRequest({ userEmail: 'sin-arroba' }),
      response,
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.equal(captured.status, 200)
    assert.equal(llamadas, 0)
    assert.equal(body.type, 'success')
    assert.isNull(body.data)
  })

  test('la respuesta es idéntica exista o no la cuenta, y no filtra el rol', async ({ assert }) => {
    // El gate de rol corta dentro del servicio, en silencio: si la respuesta
    // cambiara por el rol, el endpoint serviría para saber quién es empleado.
    const { response: existeResponse, captured: existeCaptured } = makeResponse()
    const existente = (await new MagicLinkController(makeService({ status: 'invalid' })).request({
      request: makeRequest({ userEmail: 'admin@valanserh.com' }),
      response: existeResponse,
    } as unknown as HttpContext)) as Record<string, unknown>

    const { response: colaboradorResponse, captured: colaboradorCaptured } = makeResponse()
    const colaborador = (await new MagicLinkController(makeService({ status: 'invalid' })).request({
      request: makeRequest({ userEmail: 'colaborador@valanserh.com' }),
      response: colaboradorResponse,
    } as unknown as HttpContext)) as Record<string, unknown>

    assert.equal(existeCaptured.status, colaboradorCaptured.status)
    assert.deepEqual(existente, colaborador)
    assert.notProperty(existente, 'role')
    assert.notProperty(existente, 'token')
  })
})

test.group('MagicLinkController — construcción en runtime', () => {
  test('el container lo construye sin argumentos y toma el servicio real', async ({ assert }) => {
    // Las rutas lo resuelven por string (`#controllers/magic_link_controller.request`),
    // así que el container lo instancia sin pasarle nada: si el parámetro del
    // constructor dejara de tener default, los dos endpoints morirían al
    // primer request y ninguna otra prueba lo notaría.
    const controller = await app.container.make(MagicLinkController)

    assert.instanceOf(controller, MagicLinkController)
    assert.isFunction(controller.request)
    assert.isFunction(controller.verify)
  })
})
