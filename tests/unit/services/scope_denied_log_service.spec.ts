import { test } from '@japa/runner'
import { LogStore } from '#models/MongoDB/log_store'
import ScopeDeniedLogService from '#services/scope_denied_log_service'

/**
 * Tests unitarios — log de accesos bloqueados (USRH1783372659486 §"Qué
 * información hay que guardar"). Debe registrar contexto mínimo (dominio,
 * acción, id solicitado, actor, scope) sin exponer contenido del registro
 * ajeno, y nunca debe romper la respuesta al cliente si el log falla.
 */
test.group('ScopeDeniedLogService.log', (group) => {
  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  test('registra el dominio, acción, id solicitado, actor y scope — sin contenido del registro', async ({ assert }) => {
    let capturedCollection = ''
    let capturedPayload: Record<string, unknown> = {}

    LogStore.set = async (collectionName: string, logData: any) => {
      capturedCollection = collectionName
      capturedPayload = logData
    }

    await ScopeDeniedLogService.log({
      domain: 'position',
      action: 'update',
      requestedId: 42,
      actorUserId: 7,
      businessUnitScope: [1, 2],
    })

    assert.equal(capturedCollection, 'log_scope_denied')
    assert.equal(capturedPayload.domain, 'position')
    assert.equal(capturedPayload.action, 'update')
    assert.equal(capturedPayload.requested_id, 42)
    assert.equal(capturedPayload.actor_user_id, 7)
    assert.deepEqual(capturedPayload.business_unit_scope, [1, 2])
    assert.isString(capturedPayload.date)

    // Nunca debe incluir datos del registro ajeno (solo metadatos de acceso).
    assert.notProperty(capturedPayload, 'employee')
    assert.notProperty(capturedPayload, 'record')
    assert.notProperty(capturedPayload, 'data')
  })

  test('nunca lanza si el log subyacente falla (best-effort)', async ({ assert }) => {
    LogStore.set = async () => {
      throw new Error('Mongo no disponible')
    }

    await assert.doesNotReject(async () => {
      await ScopeDeniedLogService.log({
        domain: 'department',
        action: 'show',
        requestedId: 1,
        actorUserId: null,
        businessUnitScope: [],
      })
    })
  })
})
