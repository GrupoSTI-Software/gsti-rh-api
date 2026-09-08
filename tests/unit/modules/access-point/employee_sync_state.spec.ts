import { test } from '@japa/runner'
import {
  assertTransition,
  canTransition,
  isPinQuarantined,
  PIN_QUARANTINE_STATUSES,
} from '#modules/access-point/employee-sync/employee_sync_state'
import { AdmsError } from '#exceptions/adms_error'

test.group('Estados del colaborador en un equipo', () => {
  test('el camino de alta', ({ assert }) => {
    assert.isTrue(canTransition('pending_pin', 'pending'))
    assert.isTrue(canTransition('pending', 'sent'))
    assert.isTrue(canTransition('sent', 'confirmed'))
    assert.isTrue(canTransition('sent', 'failed'))
    assert.isTrue(canTransition('failed', 'pending'))
    assert.isTrue(canTransition('confirmed', 'pending'))
  })

  test('el camino de baja', ({ assert }) => {
    assert.isTrue(canTransition('confirmed', 'revoking'))
    assert.isTrue(canTransition('failed', 'revoking'))
    assert.isTrue(canTransition('pending', 'revoking'))
    assert.isTrue(canTransition('pending_pin', 'revoking'))
    assert.isTrue(canTransition('revoking', 'revoke_sent'))
    assert.isTrue(canTransition('revoke_sent', 'revoke_acked'))
    assert.isTrue(canTransition('revoke_acked', 'revoked'))
    assert.isTrue(canTransition('revoke_sent', 'revoke_failed'))
    assert.isTrue(canTransition('revoke_failed', 'revoking'))
  })

  test('los dos caminos no se cruzan por atajos', ({ assert }) => {
    // Acusar el borrado no es haberlo borrado: falta la evidencia.
    assert.isFalse(canTransition('revoke_sent', 'revoked'))
    assert.isFalse(canTransition('revoking', 'revoked'))
    // Nada vuelve al alta sin una reasignacion explicita.
    assert.isFalse(canTransition('revoked', 'pending'))
    assert.isFalse(canTransition('revoked', 'pending_pin'))
    assert.isFalse(canTransition('revoke_acked', 'confirmed'))
    // Un alta no salta el envio.
    assert.isFalse(canTransition('pending', 'confirmed'))
    assert.isFalse(canTransition('pending_pin', 'sent'))
  })

  test('revocado es terminal', ({ assert }) => {
    for (const destino of ['pending', 'sent', 'confirmed', 'revoking'] as const) {
      assert.isFalse(canTransition('revoked', destino))
    }
  })

  test('una transicion invalida lanza con su clave', ({ assert }) => {
    let capturado: unknown = null
    try {
      assertTransition('revoked', 'confirmed')
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, AdmsError)
    assert.equal((capturado as AdmsError).key, 'transicion-invalida')
  })

  test('quedarse en el mismo estado no es una transicion', ({ assert }) => {
    assert.doesNotThrow(() => assertTransition('confirmed', 'confirmed'))
  })

  test('el PIN esta en cuarentena desde que se pide el borrado hasta la evidencia', ({
    assert,
  }) => {
    assert.deepEqual(PIN_QUARANTINE_STATUSES, [
      'revoking',
      'revoke_sent',
      'revoke_acked',
      'revoke_failed',
    ])
    assert.isTrue(isPinQuarantined('revoking'))
    assert.isTrue(isPinQuarantined('revoke_acked'))
    // Ya confirmado el borrado, el PIN queda libre para otra persona.
    assert.isFalse(isPinQuarantined('revoked'))
    assert.isFalse(isPinQuarantined('confirmed'))
  })
})
