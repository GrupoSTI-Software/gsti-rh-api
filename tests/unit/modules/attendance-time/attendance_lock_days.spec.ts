import { test } from '@japa/runner'
import { closedLockDays } from '#modules/attendance-time/attendance_lock_days'
import AssistsService from '#services/assist_service'
import { reportI18n } from '#helpers/report_locale'
import { AssistDayInterface } from '../../../../app/interfaces/assist_day_interface.js'

/**
 * Bloqueo de asistencia: qué días cuentan y cómo se convierten los retardos.
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

test.group('AssistsService.getFaultsFromDelays', () => {
  test('cada N retardos suman una falta', ({ assert }) => {
    const service = new AssistsService(reportI18n())
    assert.equal(service.getFaultsFromDelays(7, 3), 2)
  })

  test('sin cantidad configurada los retardos no se convierten en faltas', ({ assert }) => {
    const service = new AssistsService(reportI18n())
    assert.equal(service.getFaultsFromDelays(5, 0), 0)
    assert.equal(service.getFaultsFromDelays(0, 0), 0)
  })
})
