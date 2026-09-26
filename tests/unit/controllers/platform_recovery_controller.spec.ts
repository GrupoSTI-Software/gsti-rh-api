import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import PlatformRecoveryController from '../../../app/controllers/platform_recovery_controller.js'

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
    input: (key: string) => body[key],
  } as unknown as HttpContext['request']
}

// ---------------------------------------------------------------------------
// recovery — anti-enumeración (etapa 0)
// ---------------------------------------------------------------------------

test.group('PlatformRecoveryController.recovery — anti-enumeración', () => {
  test('siempre devuelve 200 con respuesta genérica', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ userEmail: 'noexiste@gruposti.com' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.recovery = async function (this: PlatformRecoveryController, reqCtx: HttpContext) {
      return reqCtx.response.status(200).json({
        type: 'success',
        title: 'Recuperación de contraseña',
        message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
        data: null,
      })
    }
    await controller.recovery(ctx)
    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
  })

  test('la respuesta genérica no revela si el correo existe o es admin', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ userEmail: 'admin@gruposti.com' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.recovery = async function (this: PlatformRecoveryController, reqCtx: HttpContext) {
      return reqCtx.response.status(200).json({
        type: 'success',
        title: 'Recuperación de contraseña',
        message: 'Si tu correo está registrado, recibirás las instrucciones en breve.',
        data: null,
      })
    }
    await controller.recovery(ctx)
    assert.notProperty(captured.body ?? {}, 'token')
    assert.notProperty(captured.body ?? {}, 'pinCode')
    assert.notProperty(captured.body ?? {}, 'userEmail')
  })
})

// ---------------------------------------------------------------------------
// verifyToken — etapa 1
// ---------------------------------------------------------------------------

test.group('PlatformRecoveryController.verifyToken — etapa 1', () => {
  test('devuelve 200 con `true` cuando el token es válido y la cuenta es admin', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { token: 'uuid-valido-1234' },
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.verifyToken = async function (this: PlatformRecoveryController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(200).json(true as unknown as Record<string, unknown>)
    }
    await controller.verifyToken(ctx)
    assert.equal(captured.status, 200)
    assert.isTrue(captured.body as unknown as boolean)
  })

  test('devuelve 404 con AUTH.PLATFORM.RECOVERY.TOKEN_INVALID cuando el token no existe', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      params: { token: 'uuid-inexistente' },
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.verifyToken = async function (this: PlatformRecoveryController, verifyCtx: HttpContext) {
      return verifyCtx.response.status(404).json({
        title: 'Token inválido',
        detail: 'El enlace de recuperación no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID',
      })
    }
    await controller.verifyToken(ctx)
    assert.equal(captured.status, 404)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID')
  })
})

// ---------------------------------------------------------------------------
// codeVerify — etapa 2
// ---------------------------------------------------------------------------

test.group('PlatformRecoveryController.codeVerify — etapa 2', () => {
  test('devuelve 200 con { token } (token rotado) cuando el OTP es correcto', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'uuid-etapa-1', pinCode: '123456' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.codeVerify = async function (this: PlatformRecoveryController, codeCtx: HttpContext) {
      return codeCtx.response.status(200).json({ token: 'uuid-rotado-etapa-2' })
    }
    await controller.codeVerify(ctx)
    assert.equal(captured.status, 200)
    assert.property(captured.body ?? {}, 'token')
    assert.notProperty(captured.body ?? {}, 'accessToken')
    assert.notProperty(captured.body ?? {}, 'refreshToken')
  })

  test('devuelve 401 AUTH.PLATFORM.RECOVERY.CODE_INVALID cuando el OTP es incorrecto o expirado', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'uuid-etapa-1', pinCode: '000000' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.codeVerify = async function (this: PlatformRecoveryController, codeCtx: HttpContext) {
      return codeCtx.response.status(401).json({
        title: 'Código inválido',
        detail: 'El código ingresado no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.CODE_INVALID',
      })
    }
    await controller.codeVerify(ctx)
    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.RECOVERY.CODE_INVALID')
  })

  test('la respuesta de codeVerify exitoso solo incluye token (sin sesión abierta)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'uuid-etapa-1', pinCode: '654321' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.codeVerify = async function (this: PlatformRecoveryController, codeCtx: HttpContext) {
      return codeCtx.response.status(200).json({ token: 'uuid-rotado' })
    }
    await controller.codeVerify(ctx)
    const keys = Object.keys(captured.body ?? {})
    assert.deepEqual(keys, ['token'])
    assert.notProperty(captured.body ?? {}, 'accessToken')
    assert.notProperty(captured.body ?? {}, 'user')
  })
})

// ---------------------------------------------------------------------------
// passwordReset — etapa 3
// ---------------------------------------------------------------------------

test.group('PlatformRecoveryController.passwordReset — etapa 3', () => {
  test('devuelve 200 con type success (sin sesión ni token en la respuesta)', async ({ assert }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'uuid-etapa-2', userPassword: 'NuevaPass123!' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.passwordReset = async function (this: PlatformRecoveryController, resetCtx: HttpContext) {
      return resetCtx.response.status(200).json({
        type: 'success',
        title: 'Recuperación de contraseña',
        message: 'Tu contraseña fue actualizada correctamente. Ya puedes iniciar sesión.',
      })
    }
    await controller.passwordReset(ctx)
    assert.equal(captured.status, 200)
    assert.equal(captured.body?.type, 'success')
    assert.notProperty(captured.body ?? {}, 'token')
    assert.notProperty(captured.body ?? {}, 'accessToken')
  })

  test('devuelve 404 AUTH.PLATFORM.RECOVERY.TOKEN_INVALID cuando el token no es de plataforma', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-invalido', userPassword: 'NuevaPass123!' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.passwordReset = async function (this: PlatformRecoveryController, resetCtx: HttpContext) {
      return resetCtx.response.status(404).json({
        title: 'Token inválido',
        detail: 'El enlace de recuperación no es válido o ha expirado.',
        key: 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID',
      })
    }
    await controller.passwordReset(ctx)
    assert.equal(captured.status, 404)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID')
  })

  test('devuelve 401 AUTH.PLATFORM.RECOVERY.PIN_PENDING cuando el OTP no fue completado (etapa 2 omitida)', async ({
    assert,
  }) => {
    const { response, captured } = makeResponse()
    const ctx = {
      request: makeRequestWithBody({ token: 'token-con-pin', userPassword: 'NuevaPass123!' }),
      response,
    } as unknown as HttpContext

    const controller = new PlatformRecoveryController()
    controller.passwordReset = async function (this: PlatformRecoveryController, resetCtx: HttpContext) {
      return resetCtx.response.status(401).json({
        title: 'Paso incompleto',
        detail: 'Debes completar la verificación del código antes de cambiar la contraseña.',
        key: 'AUTH.PLATFORM.RECOVERY.PIN_PENDING',
      })
    }
    await controller.passwordReset(ctx)
    assert.equal(captured.status, 401)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.RECOVERY.PIN_PENDING')
  })
})

// ---------------------------------------------------------------------------
// Contrato de claves de error
// ---------------------------------------------------------------------------

test.group('PlatformRecoveryController — contrato de claves de error', () => {
  test('los errores usan el namespace AUTH.PLATFORM.RECOVERY.*', ({ assert }) => {
    const errorKeys = [
      'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID',
      'AUTH.PLATFORM.RECOVERY.CODE_INVALID',
      'AUTH.PLATFORM.RECOVERY.PIN_PENDING',
    ]
    for (const key of errorKeys) {
      assert.isTrue(key.startsWith('AUTH.PLATFORM.RECOVERY.'), `${key} debe tener el prefijo correcto`)
    }
  })

  test('ninguna respuesta de error de recuperación incluye el campo code', ({ assert }) => {
    const errorBodies = [
      { title: 'Token inválido', detail: '...', key: 'AUTH.PLATFORM.RECOVERY.TOKEN_INVALID' },
      { title: 'Código inválido', detail: '...', key: 'AUTH.PLATFORM.RECOVERY.CODE_INVALID' },
      { title: 'Paso incompleto', detail: '...', key: 'AUTH.PLATFORM.RECOVERY.PIN_PENDING' },
    ]
    for (const body of errorBodies) {
      assert.notProperty(body, 'code')
    }
  })
})
