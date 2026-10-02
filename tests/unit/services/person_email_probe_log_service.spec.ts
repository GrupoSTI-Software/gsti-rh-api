import { test } from '@japa/runner'
import { LogStore } from '#models/MongoDB/log_store'
import PersonEmailProbeLogService from '#services/person_email_probe_log_service'
import { blindIndex } from '#utils/blind_index'

/**
 * Tests unitarios — bitácora de intentos de captura de correo personal
 * (USRH1789762889970). El correo personal es único GLOBAL, así que su rechazo
 * es un oráculo de existencia por construcción: esta bitácora es lo que permite
 * reconocer el sondeo después y atribuirlo a un actor con nombre.
 *
 * Debe registrar SOLO la huella del correo (jamás el correo en claro) y NUNCA
 * el `person_id`, el `business_unit_id` ni el nombre del TITULAR COLISIONADO —
 * registrarlos convertiría la bitácora en un mapa entre clientes. Y si el log
 * falla, no debe romper NI CAMBIAR la respuesta al cliente.
 */
test.group('PersonEmailProbeLogService.log', (group) => {
  // Correo en claro usado solo para fabricar la huella del caso de prueba.
  const plainEmail = 'sondeo-prueba@dominio.mx'

  let originalSet: typeof LogStore.set

  group.each.setup(() => {
    originalSet = LogStore.set
  })

  group.each.teardown(() => {
    LogStore.set = originalSet
  })

  function captureSet(): { collection: () => string; payload: () => Record<string, unknown> } {
    let capturedCollection = ''
    let capturedPayload: Record<string, unknown> = {}

    LogStore.set = async (collectionName: string, logData: Parameters<typeof LogStore.set>[1]) => {
      capturedCollection = collectionName
      capturedPayload = logData as Record<string, unknown>
    }

    return { collection: () => capturedCollection, payload: () => capturedPayload }
  }

  test('escribe en log_person_email_probe con EXACTAMENTE las siete llaves del contrato', async ({ assert }) => {
    const captured = captureSet()

    await PersonEmailProbeLogService.log({
      path: 'store',
      personEmailHash: blindIndex(plainEmail),
      outcome: 'accepted',
      actorUserId: 7,
      businessUnitScope: [1, 2],
      targetPersonId: null,
    })

    assert.equal(captured.collection(), 'log_person_email_probe')
    assert.deepEqual(Object.keys(captured.payload()).sort(), [
      'actor_user_id',
      'business_unit_scope',
      'date',
      'email_hash',
      'outcome',
      'path',
      'target_person_id',
    ])
    assert.equal(captured.payload().path, 'store')
    assert.equal(captured.payload().email_hash, blindIndex(plainEmail))
    assert.equal(captured.payload().outcome, 'accepted')
    assert.equal(captured.payload().actor_user_id, 7)
    assert.deepEqual(captured.payload().business_unit_scope, [1, 2])
    assert.isNull(captured.payload().target_person_id)
  })

  test('date es un ISO en UTC (sufijo Z)', async ({ assert }) => {
    const captured = captureSet()

    await PersonEmailProbeLogService.log({
      path: 'update',
      personEmailHash: blindIndex(plainEmail),
      outcome: 'rejected_not_available',
      actorUserId: 3,
      businessUnitScope: [],
      targetPersonId: 42,
    })

    assert.isString(captured.payload().date)
    assert.match(
      captured.payload().date as string,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
      'la fecha de la bitácora es ISO-8601 en UTC'
    )
  })

  test('no filtra el correo en claro ni claves del titular colisionado', async ({ assert }) => {
    const captured = captureSet()

    await PersonEmailProbeLogService.log({
      path: 'update',
      personEmailHash: blindIndex(plainEmail),
      outcome: 'rejected_not_available',
      actorUserId: 3,
      businessUnitScope: [9],
      targetPersonId: 42,
    })

    const serialized = JSON.stringify(captured.payload())
    assert.notInclude(serialized, plainEmail, 'el correo en claro jamás entra a la bitácora')
    // Las comillas distinguen la clave exacta `person_id` de `target_person_id`,
    // que sí es legítima (es el expediente propio sobre el que se escribe).
    assert.notInclude(serialized, '"person_id":', 'no se registra el titular colisionado')
    assert.notInclude(serialized, '"business_unit_id":', 'no se registra la empresa del titular')
  })

  test('nunca lanza si el log subyacente falla (best-effort)', async ({ assert }) => {
    LogStore.set = async () => {
      throw new Error('Mongo caído')
    }

    await assert.doesNotReject(async () => {
      await PersonEmailProbeLogService.log({
        path: 'import',
        personEmailHash: blindIndex(plainEmail),
        outcome: 'accepted',
        actorUserId: null,
        businessUnitScope: [1],
        targetPersonId: null,
      })
    })
  })

  test('acepta los tres outcomes del contrato', async ({ assert }) => {
    const outcomes = ['accepted', 'rejected_not_available', 'rate_limited'] as const

    for (const outcome of outcomes) {
      const captured = captureSet()

      await PersonEmailProbeLogService.log({
        path: 'import',
        personEmailHash: blindIndex(plainEmail),
        outcome,
        actorUserId: null,
        businessUnitScope: [],
        targetPersonId: null,
      })

      assert.equal(captured.payload().outcome, outcome)
    }
  })
})
