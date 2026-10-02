import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import ApiToken from '#models/api_token'
import PlatformAdminMiddleware from '../../../app/middleware/platform_admin_middleware.js'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

interface MockUser {
  userId: number
  isPlatformAdmin: boolean
  currentAccessToken?: { identifier: string | number } | null
}

function makeContext(options: {
  user?: MockUser | null
} = {}): { ctx: HttpContext; captured: CapturedResponse; nextCalled: { value: boolean } } {
  const captured: CapturedResponse = {}
  const nextCalled = { value: false }

  const ctx = {
    auth: { user: options.user ?? null },
    response: {
      status(code: number) {
        captured.status = code
        return {
          json(body: Record<string, unknown>) {
            captured.body = body
            return body
          },
        }
      },
    },
  } as unknown as HttpContext

  return { ctx, captured, nextCalled }
}

function stubApiTokenOrigin(origin: string | null): () => void {
  const tokenModel = ApiToken as unknown as { query: typeof ApiToken.query }
  const originalQuery = tokenModel.query

  tokenModel.query = function queryStub() {
    return {
      where() {
        return {
          async first() {
            return origin === null ? null : { origin }
          },
        }
      },
    } as unknown as ReturnType<typeof ApiToken.query>
  } as typeof ApiToken.query

  return () => {
    tokenModel.query = originalQuery
  }
}

test.group('PlatformAdminMiddleware — fail-closed', () => {
  test('bloquea con 403 cuando el usuario no tiene el marcador (isPlatformAdmin = false)', async ({
    assert,
  }) => {
    const { ctx, captured, nextCalled } = makeContext({
      user: { userId: 1, isPlatformAdmin: false, currentAccessToken: { identifier: 10 } },
    })

    await new PlatformAdminMiddleware().handle(ctx, async () => {
      nextCalled.value = true
    })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isFalse(nextCalled.value)
  })

  test('bloquea con 403 cuando no hay usuario autenticado (auth.user = null)', async ({ assert }) => {
    const { ctx, captured, nextCalled } = makeContext({ user: null })

    await new PlatformAdminMiddleware().handle(ctx, async () => {
      nextCalled.value = true
    })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isFalse(nextCalled.value)
  })

  test('bloquea con 403 cuando falta el identificador del token', async ({ assert }) => {
    const restore = stubApiTokenOrigin('platform')
    try {
      const { ctx, captured, nextCalled } = makeContext({
        user: { userId: 2, isPlatformAdmin: true, currentAccessToken: null },
      })

      await new PlatformAdminMiddleware().handle(ctx, async () => {
        nextCalled.value = true
      })

      assert.equal(captured.status, 403)
      assert.isFalse(nextCalled.value)
    } finally {
      restore()
    }
  })

  test('bloquea con 403 cuando el token no es de consola (origin distinto de platform)', async ({
    assert,
  }) => {
    const restore = stubApiTokenOrigin('web')
    try {
      const { ctx, captured, nextCalled } = makeContext({
        user: { userId: 3, isPlatformAdmin: true, currentAccessToken: { identifier: 99 } },
      })

      await new PlatformAdminMiddleware().handle(ctx, async () => {
        nextCalled.value = true
      })

      assert.equal(captured.status, 403)
      assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isFalse(nextCalled.value)
    } finally {
      restore()
    }
  })

  test('la respuesta 403 incluye title y detail correctos', async ({ assert }) => {
    const { ctx, captured } = makeContext({
      user: { userId: 4, isPlatformAdmin: false, currentAccessToken: { identifier: 1 } },
    })

    await new PlatformAdminMiddleware().handle(ctx, async () => {})

    assert.equal(captured.body?.title, 'Acceso restringido a plataforma')
    assert.equal(captured.body?.detail, 'Esta sección es exclusiva de administradores de plataforma.')
  })
})

test.group('PlatformAdminMiddleware — permite acceso con token platform', () => {
  test('llama a next() cuando el token es de consola', async ({ assert }) => {
    const restore = stubApiTokenOrigin('platform')
    try {
      const { ctx, captured, nextCalled } = makeContext({
        user: { userId: 5, isPlatformAdmin: true, currentAccessToken: { identifier: 77 } },
      })

      await new PlatformAdminMiddleware().handle(ctx, async () => {
        nextCalled.value = true
        assert.isTrue(TenantContext.isBypassed())
      })

      assert.isTrue(nextCalled.value)
      assert.isUndefined(captured.status)
    } finally {
      restore()
    }
  })

  test('envuelve next() en runUnscoped con motivo PLATFORM_ADMIN', async ({ assert }) => {
    const restore = stubApiTokenOrigin('platform')
    try {
      const { ctx } = makeContext({
        user: { userId: 6, isPlatformAdmin: true, currentAccessToken: { identifier: 88 } },
      })

      await new PlatformAdminMiddleware().handle(ctx, async () => {
        assert.isTrue(TenantContext.isBypassed())
        assert.isTrue(TenantContext.isActive())
      })
    } finally {
      restore()
    }

    assert.isFalse(TenantContext.isActive(), 'el bypass no debe filtrarse fuera del middleware')
    assert.equal(TENANT_UNSCOPED_REASON.PLATFORM_ADMIN, 'platform-admin')
  })
})

test.group('PlatformAdminMiddleware — contrato de error AUTH.PLATFORM.FORBIDDEN', () => {
  test('la key es exactamente AUTH.PLATFORM.FORBIDDEN (contrato con el cliente)', async ({ assert }) => {
    const { ctx, captured } = makeContext({
      user: { userId: 7, isPlatformAdmin: false, currentAccessToken: { identifier: 1 } },
    })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
  })

  test('la respuesta de error no incluye campo code (estilo AUTH dominante del proyecto)', async ({
    assert,
  }) => {
    const { ctx, captured } = makeContext({
      user: { userId: 8, isPlatformAdmin: false, currentAccessToken: { identifier: 1 } },
    })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.notProperty(captured.body ?? {}, 'code')
  })

  test('la respuesta de error no filtra información interna (sin stack ni detalles técnicos)', async ({
    assert,
  }) => {
    const { ctx, captured } = makeContext({ user: null })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.notProperty(captured.body ?? {}, 'stack')
    assert.notProperty(captured.body ?? {}, 'error')
  })
})
