import { test } from '@japa/runner'
import { daysBetweenBusinessDates } from '../../../app/utils/business_date.js'

test.group('business_date — daysBetweenBusinessDates (USRH1786107870847)', () => {
  test('cuenta días civiles con convención from inclusive, to exclusive', ({ assert }) => {
    assert.equal(daysBetweenBusinessDates('2026-08-01', '2026-09-01'), 31)
    assert.equal(daysBetweenBusinessDates('2026-08-22', '2026-09-01'), 10)
  })

  test('devuelve negativo cuando to es anterior a from', ({ assert }) => {
    assert.equal(daysBetweenBusinessDates('2026-09-01', '2026-08-01'), -31)
  })
})
