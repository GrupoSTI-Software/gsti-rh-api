import { test } from '@japa/runner'
import {
  legacyCheckInBucket,
  legacyCheckOutBucket,
} from '#modules/attendance-time/reconcile/legacy_attendance_rule'

const tolerances = { delayMinutes: 10, faultMinutes: 30 }

/**
 * La copia congelada reproduce lo que hacía el sync: la entrada leía la
 * checada como UTC real con -06:00 fijo y la salida con la pared del checador.
 */
test.group('reconcile-timezone — regla legada congelada', () => {
  test('entrada: 13:55Z con turno de 08:00 era "a tiempo" (07:55 en -06:00)', ({ assert }) => {
    assert.equal(
      legacyCheckInBucket('2026-09-01', '08:00:00', '2026-09-01T13:55:00.000Z', tolerances),
      'ontime'
    )
    assert.equal(
      legacyCheckInBucket('2026-09-01', '08:00:00', '2026-09-01T14:39:00.000Z', tolerances),
      'fault'
    )
    assert.equal(legacyCheckInBucket('2026-09-01', '08:00:00', null, tolerances), 'fault')
  })

  test('entrada: el minuto de gracia sigue contando como a tiempo', ({ assert }) => {
    assert.equal(
      legacyCheckInBucket('2026-09-01', '08:00:00', '2026-09-01T14:00:59.000Z', tolerances),
      'ontime'
    )
    assert.equal(
      legacyCheckInBucket('2026-09-01', '08:00:00', '2026-09-01T14:02:00.000Z', tolerances),
      'tolerance'
    )
  })

  test('salida: en verano la marca 23:00Z (pared 18:00 + 5) era puntual para un turno 9-18', ({
    assert,
  }) => {
    assert.equal(legacyCheckOutBucket('2026-07-22', '09:00:00', 9, '2026-07-22T23:00:00.000Z'), 'ontime')
    assert.equal(legacyCheckOutBucket('2026-07-22', '09:00:00', 9, '2026-07-22T22:20:00.000Z'), 'delay')
    assert.isNull(legacyCheckOutBucket('2026-07-22', '09:00:00', 9, null))
  })
})
