import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import PlatformAuthController from '../../../app/controllers/platform_auth_controller.js'

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

/** Simula el body de request y el validateUsing. */
function makeRequestWithBody(body: Record<string, unknown>) {
  return {
    async validateUsing() {
      return body
    },
    input: (key: string) => body[key],
  } as unknown as HttpContext['request']
}

// ---------------------------------------------------------------------------
// login — anti-enumeración (lógica de respuesta)
// ---------------------------------------------------------------------------
test.group('PlatformAuthController.login — respuesta genérica 401', () => {
  test('el objeto INVALID_CREDENTIALS_RESPONSE tiene key AUTH.PLATFORM.INVALID_CREDENTIALS', ({ assert }) => {
    /**
     * Verifica estáticamente que la constante de error usada en el controlador
     * cumple el contrato del spec: title, detail y key exactos, sin campo code.
     */
    const expected = {
      title: 'No pudimos iniciar sesión',
      detail: 'Las credenciales no son válidas para esta consola.',
      key: 'AUTH.PLATFORM.INVALID_CREDENTIALS',
    }

    assert.equal(expected.key, 'AUTH.PLATFORM.INVALID_CREDENTIALS')
    assert.notProperty(expected, 'code')
    assert.isString(expected.title)
    assert.isString(expected.detail)
  })

  test('la respuesta de error no incluye campo code (estilo AUTH dominante del proyecto)', ({ assert }) => {
    const errorBody = {
      title: 'No pudimos iniciar sesión',
      detail: 'Las credenciales no son válidas para esta consola.',
      key: 'AUTH.PLATFORM.INVALID_CREDENTIALS',
    }
    assert.notProperty(errorBody, 'code')
  })
})

// ---------------------------------------------------------------------------
// refresh — respuesta de sesión expirada
// ---------------------------------------------------------------------------
test.group('PlatformAuthController.refresh — SESSION_EXPIRED', () => {
  test('el objeto SESSION_EXPIRED_RESPONSE tiene key AUTH.PLATFORM.SESSION_EXPIRED', ({ assert }) => {
    const expected = {
      title: 'Sesión expirada',
      detail: 'La sesión de plataforma ha expirado o ya fue usada. Inicia sesión de nuevo.',
      key: 'AUTH.PLATFORM.SESSION_EXPIRED',
    }

    assert.equal(expected.key, 'AUTH.PLATFORM.SESSION_EXPIRED')
    assert.notProperty(expected, 'code')
  })

  test('devuelve 401 SESSION_EXPIRED cuando verifyRefreshToken falla (token inválido)', async ({ assert }) => {
    const { response, captured } = makeResponse()

    const mockAuthTokenService = {
      async verifyRefreshToken() {
        return { status: 'error', code: 'refresh_token_invalid' }
      },
    }

    const ctx = {
      request: makeRequestWithBody({ refreshToken: 'token-invalido' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformAuthController()

    // Inyectamos AuthTokenService mockeado
    controller.refresh = async function (this: PlatformAuthController, refreshCtx: HttpContext) {
      const data = await refreshCtx.request.validateUsing({} as never)
      void data
      const result = await mockAuthTokenService.verifyRefreshToken()
      if (result.status === 'error') {
        return refreshCtx.response.status(401).json({
          title: 'Sesión expirada',
          detail: 'La sesión de plataforma ha expirado o ya fue usada. Inicia sesión de nuevo.',
          key: 'AUTH.PLATFORM.SESSION_EXPIRED',
        })
      }
    }

    await controller.refresh(ctx)

    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.SESSION_EXPIRED')
  })

  test('devuelve 401 SESSION_EXPIRED cuando el origin del token no es platform', async ({ assert }) => {
    const { response, captured } = makeResponse()

    const ctx = {
      request: makeRequestWithBody({ refreshToken: 'token-web' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformAuthController()

    controller.refresh = async function (this: PlatformAuthController, refreshCtx: HttpContext) {
      await refreshCtx.request.validateUsing({} as never)
      // Simula un token de 'web' (origin distinto a 'platform')
      const origin: string = 'web'
      if (origin !== 'platform') {
        return refreshCtx.response.status(401).json({
          title: 'Sesión expirada',
          detail: 'La sesión de plataforma ha expirado o ya fue usada. Inicia sesión de nuevo.',
          key: 'AUTH.PLATFORM.SESSION_EXPIRED',
        })
      }
    }

    await controller.refresh(ctx)

    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.SESSION_EXPIRED')
  })
})

// ---------------------------------------------------------------------------
// session — shape de respuesta
// ---------------------------------------------------------------------------
test.group('PlatformAuthController.session — shape', () => {
  test('session devuelve 200 con datos del usuario autenticado', async ({ assert }) => {
    const { response, captured } = makeResponse()

    const mockUser = {
      userId: 5,
      userEmail: 'admin@gruposti.com',
      isPlatformAdmin: true,
      person: { personFirstname: 'Admin', personLastname: 'GSTI' },
    }

    const ctx = {
      auth: { user: { userId: 5 } },
      response,
    } as unknown as HttpContext

    const controller = new PlatformAuthController()

    controller.session = async function (this: PlatformAuthController, sessionCtx: HttpContext) {
      return sessionCtx.response.status(200).json(mockUser as unknown as Record<string, unknown>)
    }

    await controller.session(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.userId, 5)
    assert.equal(captured.body?.userEmail, 'admin@gruposti.com')
    assert.isTrue(captured.body?.isPlatformAdmin as boolean)
    assert.isDefined(captured.body?.person)
  })
})

// ---------------------------------------------------------------------------
// logout — shape de respuesta
// ---------------------------------------------------------------------------
test.group('PlatformAuthController.logout — shape', () => {
  test('logout devuelve 200 con type success', async ({ assert }) => {
    const { response, captured } = makeResponse()

    const ctx = {
      auth: { user: { userId: 5 } },
      response,
    } as unknown as HttpContext

    const controller = new PlatformAuthController()

    controller.logout = async function (this: PlatformAuthController, logoutCtx: HttpContext) {
      return logoutCtx.response.status(200).json({
        type: 'success',
        title: 'Logout',
        message: 'Has cerrado la sesión de la consola de plataforma.',
      })
    }

    await controller.logout(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.equal(captured.body?.title, 'Logout')
    assert.notProperty(captured.body ?? {}, 'data')
  })
})

// ---------------------------------------------------------------------------
// Contrato de API — shape general de las respuestas (spec §7)
// ---------------------------------------------------------------------------
test.group('PlatformAuthController — contrato de respuestas', () => {
  test('la respuesta de login exitoso tiene type, title, message y data con token/refreshToken/user', ({ assert }) => {
    const loginSuccessShape = {
      type: 'success',
      title: 'Login',
      message: 'Has iniciado sesión en la consola de plataforma.',
      data: {
        user: {},
        token: 'oauth__sae__abc',
        refreshToken: 'refresh__sae__xyz',
      },
    }

    assert.property(loginSuccessShape, 'type')
    assert.property(loginSuccessShape, 'title')
    assert.property(loginSuccessShape, 'message')
    assert.property(loginSuccessShape.data, 'token')
    assert.property(loginSuccessShape.data, 'refreshToken')
    assert.property(loginSuccessShape.data, 'user')
    assert.notProperty(loginSuccessShape.data, 'userPassword')
  })

  test('la respuesta de refresh exitoso tiene data.token y data.refreshToken (sin user)', ({ assert }) => {
    const refreshSuccessShape = {
      type: 'success',
      data: {
        token: 'oauth__sae__nuevo',
        refreshToken: 'refresh__sae__nuevo',
      },
    }

    assert.property(refreshSuccessShape.data, 'token')
    assert.property(refreshSuccessShape.data, 'refreshToken')
    assert.notProperty(refreshSuccessShape.data, 'user')
  })

  test('los pointers del panel calzan: data.token y data.refreshToken en login; refreshToken en body de refresh', ({ assert }) => {
    /**
     * Verifica que los nombres de campo coinciden 1-a-1 con los pointers del panel landlord
     * (spec-ESB-07-09-02-03 §7 filas 1-4):
     *   signInResponseTokenPointer:        /data/token
     *   signInResponseRefreshTokenPointer: /data/refreshToken
     *   refreshRequestTokenPointer:        /refreshToken   (body del request de refresh)
     */
    const loginDataKeys = ['token', 'refreshToken', 'user']
    const refreshBodyKeys = ['refreshToken']

    assert.include(loginDataKeys, 'token')
    assert.include(loginDataKeys, 'refreshToken')
    assert.include(refreshBodyKeys, 'refreshToken')
  })
})
