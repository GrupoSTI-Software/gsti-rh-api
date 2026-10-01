import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { vacationPeriodDates } from '#modules/employee-vacations/vacation_period_dates'

const HIRE = DateTime.fromISO('2020-11-26')
const TODAY = DateTime.fromISO('2026-09-30')

test.group('Fechas del periodo de vacaciones', () => {
  /** Mismos valores que el prototipo para un ingreso del 26 de noviembre de 2020. */
  test('el periodo en curso prescribe 18 meses despues de su fin', ({ assert }) => {
    assert.deepEqual(vacationPeriodDates(HIRE, 2025, TODAY), {
      periodStartsAt: '2025-11-26',
      periodEndsAt: '2026-11-25',
      prescribesAt: '2028-05-25',
      state: 'current',
    })
  })

  test('un periodo terminado y sin prescribir esta por vencer', ({ assert }) => {
    const dates = vacationPeriodDates(HIRE, 2024, TODAY)
    assert.equal(dates.prescribesAt, '2027-05-25')
    assert.equal(dates.state, 'expiring')
  })

  test('un periodo prescrito esta vencido', ({ assert }) => {
    const dates = vacationPeriodDates(HIRE, 2023, TODAY)
    assert.equal(dates.prescribesAt, '2026-05-25')
    assert.equal(dates.state, 'expired')
  })

  test('el dia de la prescripcion todavia cuenta', ({ assert }) => {
    assert.equal(vacationPeriodDates(HIRE, 2023, DateTime.fromISO('2026-05-25')).state, 'expiring')
  })

  test('un ingreso en 29 de febrero abre en 28 los años no bisiestos', ({ assert }) => {
    const dates = vacationPeriodDates(DateTime.fromISO('2020-02-29'), 2021, TODAY)
    assert.equal(dates.periodStartsAt, '2021-02-28')
  })
})
