import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { isPaymentFailureActive } from '#services/billing_recurring_billing_service'

test.group('isPaymentFailureActive — USRH1790708507781 CA-6', () => {
  test('sin fallo devuelve false', ({ assert }) => {
    assert.isFalse(isPaymentFailureActive(null, null))
    assert.isFalse(isPaymentFailureActive(null, DateTime.utc()))
  })

  test('fallo sin pago stripe previo devuelve true', ({ assert }) => {
    const failedAt = DateTime.fromISO('2026-10-01T12:00:00Z')
    assert.isTrue(isPaymentFailureActive(failedAt, null))
  })

  test('pago stripe anterior al fallo mantiene fallo vigente', ({ assert }) => {
    const failedAt = DateTime.fromISO('2026-10-10T12:00:00Z')
    const paidAt = DateTime.fromISO('2026-10-09T12:00:00Z')
    assert.isTrue(isPaymentFailureActive(failedAt, paidAt))
  })

  test('pago stripe en el mismo instante supera el fallo', ({ assert }) => {
    const instant = DateTime.fromISO('2026-10-10T12:00:00.000Z')
    assert.isFalse(isPaymentFailureActive(instant, instant))
  })

  test('pago stripe posterior supera el fallo', ({ assert }) => {
    const failedAt = DateTime.fromISO('2026-10-10T12:00:00Z')
    const paidAt = DateTime.fromISO('2026-10-11T12:00:00Z')
    assert.isFalse(isPaymentFailureActive(failedAt, paidAt))
  })
})
