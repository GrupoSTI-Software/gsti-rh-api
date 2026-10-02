import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { vacationPeriodDates } from '#modules/employee-vacations/vacation_period_dates'

const HIRE = DateTime.fromISO('2020-11-26')
const TODAY = DateTime.fromISO('2026-09-30')

test.group('Fechas del periodo de vacaciones', () => {
  /** Los dias se ganan al abrir el periodo: 18 meses desde ese aniversario. */
  test('el periodo en curso prescribe 18 meses despues de su inicio', ({ assert }) => {
    assert.deepEqual(vacationPeriodDates(HIRE, 2025, TODAY), {
      periodStartsAt: '2025-11-26',
      periodEndsAt: '2026-11-25',
      prescribesAt: '2027-05-25',
      state: 'current',
    })
  })

  test('un periodo terminado y dentro de los seis meses esta por vencer', ({ assert }) => {
    const dates = vacationPeriodDates(HIRE, 2024, DateTime.fromISO('2026-01-15'))
    assert.equal(dates.prescribesAt, '2026-05-25')
    assert.equal(dates.state, 'expiring')
  })

  test('un periodo prescrito esta vencido', ({ assert }) => {
    const dates = vacationPeriodDates(HIRE, 2024, TODAY)
    assert.equal(dates.state, 'expired')
  })

  test('el ultimo dia para reclamar todavia cuenta', ({ assert }) => {
    assert.equal(vacationPeriodDates(HIRE, 2024, DateTime.fromISO('2026-05-25')).state, 'expiring')
    assert.equal(vacationPeriodDates(HIRE, 2024, DateTime.fromISO('2026-05-26')).state, 'expired')
  })

  test('un ingreso en 29 de febrero abre en 28 los años no bisiestos', ({ assert }) => {
    const dates = vacationPeriodDates(DateTime.fromISO('2020-02-29'), 2021, TODAY)
    assert.equal(dates.periodStartsAt, '2021-02-28')
  })
})
