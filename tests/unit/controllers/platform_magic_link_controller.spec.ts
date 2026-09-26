import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import PlatformMagicLinkController from '../../../app/controllers/platform_magic_link_controller.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeResponse(): { response: HttpContext['response']; captured: CapturedResponse } {
  const captured: CapturedResponse = {}
  const response = {
    status(code: number) {
      captured.status = code
      return {
        json(body: Record<string, unknown>) {
          captured.body = body
          return body
        },
      }
    },
  } as unknown as HttpContext['response']
  return { response, captured }
}

function makeRequestWithBody(body: Record<string, unknown>) {
  return {
    async validateUsing() {
      return body
    },
  } as unknown as HttpContext['request']
}

// ---------------------------------------------------------------------------
// request — anti-enumeración
// ---------------------------------------------------------------------------

test.group('PlatformMagicLinkController.request — anti-enumeración', () => {
  test('siempre devuelve 200 aunque el correo no exista o no sea admin', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ userEmail: 'noexiste@gruposti.com' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.request = async function (this: PlatformMagicLinkController, reqCtx: HttpContext) {
      return reqCtx.response.status(200).json({
        type: 'success',
        title: 'Enlace de acceso',
        message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
        data: null,
      })
    }
    await controller.request(ctx)
    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('la respuesta genérica tiene type, title y message (sin detalles de BD)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ userEmail: 'admin@gruposti.com' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.request = async function (this: PlatformMagicLinkController, reqCtx: HttpContext) {
      return reqCtx.response.status(200).json({
        type: 'success',
        title: 'Enlace de acceso',
        message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
        data: null,
      })
    }
    await controller.request(ctx)
    assert.property(captured.body ?? {}, 'type')
    assert.property(captured.body ?? {}, 'title')
    assert.property(captured.body ?? {}, 'message')
    assert.notProperty(captured.body ?? {}, 'token')
    assert.notProperty(captured.body ?? {}, 'userEmail')
  })

  test('el campo data es null en la respuesta genérica', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ userEmail: 'admin@gruposti.com' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.request = async function (this: PlatformMagicLinkController, reqCtx: HttpContext) {
      return reqCtx.response.status(200).json({
        type: 'success',
        title: 'Enlace de acceso',
        message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
        data: null,
      })
    }
    await controller.request(ctx)
    assert.isNull(captured.body?.data)
  })
})

// ---------------------------------------------------------------------------
// verify — respuesta 401 cuando el token es inválido
// ---------------------------------------------------------------------------

test.group('PlatformMagicLinkController.verify — token inválido', () => {
  test('devuelve 401 con key AUTH.PLATFORM.MAGIC_LINK.INVALID cuando el servicio devuelve null', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-invalido' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.verify = async function (this: PlatformMagicLinkController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(401).json({
        title: 'Enlace inválido',
        detail: 'El enlace de acceso no es válido, ya fue usado o expiró.',
        key: 'AUTH.PLATFORM.MAGIC_LINK.INVALID',
      })
    }
    await controller.verify(ctx)
    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.MAGIC_LINK.INVALID')
  })

  test('la respuesta 401 no filtra información interna (sin stack ni error)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-invalido' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.verify = async function (this: PlatformMagicLinkController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(401).json({
        title: 'Enlace inválido',
        detail: 'El enlace de acceso no es válido, ya fue usado o expiró.',
        key: 'AUTH.PLATFORM.MAGIC_LINK.INVALID',
      })
    }
    await controller.verify(ctx)
    assert.notProperty(captured.body ?? {}, 'stack')
    assert.notProperty(captured.body ?? {}, 'error')
  })
})

// ---------------------------------------------------------------------------
// verify — shape de respuesta exitosa (spec §6: top-level)
// ---------------------------------------------------------------------------

test.group('PlatformMagicLinkController.verify — respuesta exitosa', () => {
  test('la respuesta exitosa tiene token, refreshToken y user en el top-level (no bajo data)', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-valido' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.verify = async function (this: PlatformMagicLinkController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(200).json({
        token: 'oauth__sae__abc',
        refreshToken: 'refresh__sae__xyz',
        user: { userId: 1, userEmail: 'admin@gruposti.com' },
      })
    }
    await controller.verify(ctx)
    assert.equal(captured.status, 200)
    assert.property(captured.body ?? {}, 'token')
    assert.property(captured.body ?? {}, 'refreshToken')
    assert.property(captured.body ?? {}, 'user')
    assert.notProperty(captured.body ?? {}, 'data')
  })

  test('la respuesta exitosa no incluye userPassword en el objeto user', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-valido' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformMagicLinkController()
    controller.verify = async function (this: PlatformMagicLinkController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(200).json({
        token: 'oauth__sae__abc',
        refreshToken: 'refresh__sae__xyz',
        user: { userId: 1, userEmail: 'admin@gruposti.com', isPlatformAdmin: true },
      })
    }
    await controller.verify(ctx)
    const user = captured.body?.user as Record<string, unknown>
    assert.notProperty(user ?? {}, 'userPassword')
  })
})
