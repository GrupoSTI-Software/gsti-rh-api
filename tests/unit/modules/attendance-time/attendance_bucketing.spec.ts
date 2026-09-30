import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  bucketCheckIn,
  bucketCheckOut,
  minutesAfter,
} from '#modules/attendance-time/attendance_bucketing'

const tolerances = { delayMinutes: 10, faultMinutes: 30 }

test.group('attendance-time — buckets de entrada y salida', () => {
  test('la entrada se clasifica por minutos completos de retraso', ({ assert }) => {
    assert.equal(bucketCheckIn(-5, tolerances), 'ontime')
    assert.equal(bucketCheckIn(0, tolerances), 'ontime')
    assert.equal(bucketCheckIn(1, tolerances), 'tolerance')
    assert.equal(bucketCheckIn(10, tolerances), 'tolerance')
    assert.equal(bucketCheckIn(11, tolerances), 'delay')
    assert.equal(bucketCheckIn(30, tolerances), 'delay')
    assert.equal(bucketCheckIn(31, tolerances), 'fault')
  })

  test('la salida se clasifica por minutos de anticipación', ({ assert }) => {
    assert.equal(bucketCheckOut(-30, tolerances), 'ontime')
    assert.equal(bucketCheckOut(0, tolerances), 'ontime')
    assert.equal(bucketCheckOut(1, tolerances), 'tolerance')
    assert.equal(bucketCheckOut(10, tolerances), 'tolerance')
    assert.equal(bucketCheckOut(11, tolerances), 'delay')
  })

  test('los segundos no cuentan: 08:00:53 con turno de 08:00 son cero minutos', ({ assert }) => {
    const expected = DateTime.fromISO('2026-09-01T14:00:00.000Z')
    assert.equal(minutesAfter(expected, DateTime.fromISO('2026-09-01T14:00:53.000Z')), 0)
    assert.equal(minutesAfter(expected, DateTime.fromISO('2026-09-01T14:01:00.000Z')), 1)
    assert.equal(minutesAfter(expected, DateTime.fromISO('2026-09-01T13:59:10.000Z')), -1)
  })
})
