import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { assertReferralDateWithinEvent } from '#services/traumatic_event_referral_service'
import { TraumaticEventReferralError } from '#exceptions/traumatic_event_referral_error'
import { TREF_ERROR_CODES } from '#constants/traumatic_event_referral_error_codes'

/**
 * Tests unitarios de la validación de fecha de canalización (sin BD).
 *
 * Cubre los criterios de aceptación CA2 (anterior al evento) y CA3 (futura),
 * además de los bordes: igual a la ocurrencia (válido) e igual a hoy (válido).
 * Se inyecta `now` fijo para que la prueba sea determinista.
 */

const occurred = DateTime.fromISO('2026-03-10', { zone: 'UTC-6' })
const now = DateTime.fromISO('2026-06-21', { zone: 'UTC-6' })

function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

test.group('assertReferralDateWithinEvent', () => {
  test('acepta una fecha posterior al evento y no futura', ({ assert }) => {
    const referred = DateTime.fromISO('2026-04-01', { zone: 'UTC-6' })
    assert.doesNotThrow(() => assertReferralDateWithinEvent(referred, occurred, now))
  })

  test('acepta la fecha exactamente igual a la ocurrencia (borde inferior)', ({ assert }) => {
    assert.doesNotThrow(() => assertReferralDateWithinEvent(occurred, occurred, now))
  })

  test('acepta la fecha igual a hoy (borde superior)', ({ assert }) => {
    assert.doesNotThrow(() => assertReferralDateWithinEvent(now, occurred, now))
  })

  test('rechaza fecha anterior al evento con TREF.VAL.DATE.001 (CA2)', ({ assert }) => {
    const referred = DateTime.fromISO('2026-03-09', { zone: 'UTC-6' })
    const error = captureError(() => assertReferralDateWithinEvent(referred, occurred, now))

    assert.instanceOf(error, TraumaticEventReferralError)
    const tref = error as TraumaticEventReferralError
    assert.equal(tref.code, TREF_ERROR_CODES.DATE_BEFORE_EVENT)
    assert.equal(tref.key, 'fecha-canalizacion-anterior-al-evento')
    assert.equal(tref.httpStatus, 400)
  })

  test('rechaza fecha futura con TREF.VAL.DATE.002 (CA3)', ({ assert }) => {
    const referred = DateTime.fromISO('2026-06-22', { zone: 'UTC-6' })
    const error = captureError(() => assertReferralDateWithinEvent(referred, occurred, now))

    assert.instanceOf(error, TraumaticEventReferralError)
    const tref = error as TraumaticEventReferralError
    assert.equal(tref.code, TREF_ERROR_CODES.DATE_FUTURE)
    assert.equal(tref.key, 'fecha-canalizacion-futura')
    assert.equal(tref.httpStatus, 400)
  })

  test('prioriza el error de "anterior al evento" sobre cualquier otra condición', ({ assert }) => {
    // Fecha anterior al evento Y además anterior a hoy: debe disparar DATE_BEFORE_EVENT.
    const referred = DateTime.fromISO('2026-01-01', { zone: 'UTC-6' })
    const error = captureError(() => assertReferralDateWithinEvent(referred, occurred, now))

    assert.instanceOf(error, TraumaticEventReferralError)
    assert.equal((error as TraumaticEventReferralError).code, TREF_ERROR_CODES.DATE_BEFORE_EVENT)
  })
})
