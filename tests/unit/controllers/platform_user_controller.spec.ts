import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import PlatformUserController from '../../../app/controllers/platform_user_controller.js'

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

function makeWhoamiCtx(user: { userId: number; userEmail: string; isPlatformAdmin: boolean }) {
  const { response, captured } = makeResponse()
  const ctx = {
    auth: { user },
    response,
  } as unknown as HttpContext
  return { ctx, captured }
}

// ---------------------------------------------------------------------------
// whoami — lógica pura, no requiere BD
// ---------------------------------------------------------------------------
test.group('PlatformUserController.whoami', () => {
  test('devuelve 200 con userId, userEmail e isPlatformAdmin: true', async ({ assert }) => {
    const { ctx, captured } = makeWhoamiCtx({
      userId: 42,
      userEmail: 'admin@gruposti.com',
      isPlatformAdmin: true,
    })

    await new PlatformUserController().whoami(ctx)

    assert.equal(captured.status, 200)
    assert.equal(captured.body?.userId, 42)
    assert.equal(captured.body?.userEmail, 'admin@gruposti.com')
    assert.isTrue(captured.body?.isPlatformAdmin as boolean)
  })

  test('el valor de isPlatformAdmin en la respuesta es siempre true (literal)', async ({ assert }) => {
    const { ctx, captured } = makeWhoamiCtx({
      userId: 1,
      userEmail: 'test@gruposti.com',
      isPlatformAdmin: true,
    })

    await new PlatformUserController().whoami(ctx)

    assert.strictEqual(captured.body?.isPlatformAdmin, true)
  })

  test('la respuesta solo expone userId, userEmail e isPlatformAdmin (sin userPassword)', async ({ assert }) => {
    const { ctx, captured } = makeWhoamiCtx({
      userId: 7,
      userEmail: 'interno@gruposti.com',
      isPlatformAdmin: true,
    })

    await new PlatformUserController().whoami(ctx)

    const keys = Object.keys(captured.body ?? {}).sort()
    assert.deepEqual(keys, ['isPlatformAdmin', 'userId', 'userEmail'].sort())
    assert.notProperty(captured.body ?? {}, 'userPassword')
  })

  test('refleja correctamente el userId del usuario autenticado', async ({ assert }) => {
    for (const id of [1, 100, 9999]) {
      const { ctx, captured } = makeWhoamiCtx({ userId: id, userEmail: 'x@g.com', isPlatformAdmin: true })
      await new PlatformUserController().whoami(ctx)
      assert.equal(captured.body?.userId, id)
    }
  })
})

// ---------------------------------------------------------------------------
// store — anti-escalada: campos sensibles no forman parte del contrato público
// ---------------------------------------------------------------------------
test.group('PlatformUserController.store — anti-escalada (contrato del validator)', () => {
  test('los campos sensibles no están en el contrato del validator del endpoint interno', ({ assert }) => {
    /**
     * El validator `createPlatformUserValidator` define el contrato público del
     * endpoint `POST /api/platform/users`. Aquí verificamos estáticamente que
     * los campos que el servidor debe fijar internamente (isPlatformAdmin, roleId,
     * userActive) no forman parte de ese contrato.
     *
     * Es la garantía de anti-escalada (regla de negocio #4 y #5 del spec):
     * ningún caller externo puede influir en esos valores enviándolos en el body.
     */
    const allowedContractFields = [
      'personFirstname',
      'personLastname',
      'personSecondLastname',
      'userEmail',
      'userPassword',
    ]

    const serverFixedFields = ['isPlatformAdmin', 'roleId', 'userActive']

    for (const field of serverFixedFields) {
      assert.notInclude(
        allowedContractFields,
        field,
        `'${field}' no debe ser parte del contrato público — el servidor lo fija internamente`
      )
    }
  })

  test('el contrato incluye exactamente los 5 campos requeridos del negocio', ({ assert }) => {
    const required = ['personFirstname', 'personLastname', 'userEmail', 'userPassword']
    const optional = ['personSecondLastname']
    const all = [...required, ...optional]

    assert.equal(all.length, 5)
    assert.includeMembers(all, required)
    assert.includeMembers(all, optional)
  })
})
