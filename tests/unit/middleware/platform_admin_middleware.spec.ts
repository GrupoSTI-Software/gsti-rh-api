import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import PlatformAdminMiddleware from '../../../app/middleware/platform_admin_middleware.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedResponse {
  status?: number
  body?: Record<string, unknown>
}

function makeContext(options: {
  user?: { isPlatformAdmin: boolean } | null
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

// ---------------------------------------------------------------------------
// Guard fail-closed — sin marcador
// ---------------------------------------------------------------------------
test.group('PlatformAdminMiddleware — fail-closed', () => {
  test('bloquea con 403 cuando el usuario no tiene el marcador (isPlatformAdmin = false)', async ({ assert }) => {
    const { ctx, captured, nextCalled } = makeContext({ user: { isPlatformAdmin: false } })

    await new PlatformAdminMiddleware().handle(ctx, async () => { nextCalled.value = true })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isFalse(nextCalled.value)
  })

  test('bloquea con 403 cuando no hay usuario autenticado (auth.user = null)', async ({ assert }) => {
    const { ctx, captured, nextCalled } = makeContext({ user: null })

    await new PlatformAdminMiddleware().handle(ctx, async () => { nextCalled.value = true })

    assert.equal(captured.status, 403)
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
    assert.isFalse(nextCalled.value)
  })

  test('la respuesta 403 incluye title y detail correctos', async ({ assert }) => {
    const { ctx, captured } = makeContext({ user: { isPlatformAdmin: false } })

    await new PlatformAdminMiddleware().handle(ctx, async () => {})

    assert.equal(captured.body?.title, 'Acceso restringido a plataforma')
    assert.equal(captured.body?.detail, 'Esta sección es exclusiva de administradores de plataforma.')
  })
})

// ---------------------------------------------------------------------------
// Guard — permite el paso cuando el marcador está encendido
// ---------------------------------------------------------------------------
test.group('PlatformAdminMiddleware — permite acceso', () => {
  test('llama a next() cuando el usuario tiene isPlatformAdmin = true', async ({ assert }) => {
    const { ctx, captured, nextCalled } = makeContext({ user: { isPlatformAdmin: true } })

    await new PlatformAdminMiddleware().handle(ctx, async () => { nextCalled.value = true })

    assert.isTrue(nextCalled.value)
    assert.isUndefined(captured.status, 'No debe generar respuesta cuando el guard permite el paso')
  })

  test('no modifica la respuesta al dejar pasar al administrador', async ({ assert }) => {
    const { ctx, captured } = makeContext({ user: { isPlatformAdmin: true } })

    await new PlatformAdminMiddleware().handle(ctx, async () => {})

    assert.isUndefined(captured.status)
    assert.isUndefined(captured.body)
  })
})

// ---------------------------------------------------------------------------
// Contrato de error (regla de negocio #3 del spec)
// ---------------------------------------------------------------------------
test.group('PlatformAdminMiddleware — contrato de error AUTH.PLATFORM.FORBIDDEN', () => {
  test('la key es exactamente AUTH.PLATFORM.FORBIDDEN (contrato con el cliente)', async ({ assert }) => {
    const { ctx, captured } = makeContext({ user: { isPlatformAdmin: false } })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.equal(captured.body?.key, 'AUTH.PLATFORM.FORBIDDEN')
  })

  test('la respuesta de error no incluye campo code (estilo AUTH dominante del proyecto)', async ({ assert }) => {
    const { ctx, captured } = makeContext({ user: { isPlatformAdmin: false } })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.notProperty(captured.body ?? {}, 'code')
  })

  test('la respuesta de error no filtra información interna (sin stack ni detalles técnicos)', async ({ assert }) => {
    const { ctx, captured } = makeContext({ user: null })
    await new PlatformAdminMiddleware().handle(ctx, async () => {})
    assert.notProperty(captured.body ?? {}, 'stack')
    assert.notProperty(captured.body ?? {}, 'error')
  })
})
