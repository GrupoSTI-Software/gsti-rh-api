import { test } from '@japa/runner'
import { closedLockDays } from '#modules/attendance-time/attendance_lock_days'
import { AssistDayInterface } from '../../../../app/interfaces/assist_day_interface.js'

/**
 * Bloqueo de asistencia: qué días cuentan.
 */

function day(iso: string): AssistDayInterface {
  return { day: iso } as unknown as AssistDayInterface
}

test.group('attendance-time — días del bloqueo de asistencia', () => {
  test('solo cuentan los días anteriores a hoy', ({ assert }) => {
    const calendar = [day('2026-10-01'), day('2026-10-02'), day('2026-10-03'), day('2026-10-04')]
    const closed = closedLockDays(calendar, '2026-10-03')
    assert.deepEqual(
      closed.map((entry) => entry.day),
      ['2026-10-01', '2026-10-02']
    )
  })

  test('el primer día del mes no cuenta ningún día', ({ assert }) => {
    assert.lengthOf(closedLockDays([day('2026-10-01'), day('2026-10-02')], '2026-10-01'), 0)
  })
})
