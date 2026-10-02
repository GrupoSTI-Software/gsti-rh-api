import { test } from '@japa/runner'
import {
  PRE_REFORM_SCALE_APPLY_SINCE,
  REFORM_2023_SCALE_APPLY_SINCE,
  VACATION_SCALE_MAX_YEARS,
  preReformVacationDays,
  reform2023VacationDays,
  vacationScaleRows,
} from '#modules/employee-vacations/vacation_scale_catalog'

test.group('Escalas de vacaciones de la LFT', () => {
  test('escala anterior a la reforma', ({ assert }) => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 9, 10, 14, 15, 20, 25].map(preReformVacationDays),
      [6, 8, 10, 12, 14, 14, 16, 16, 18, 20, 22]
    )
  })

  test('escala de la reforma 2023', ({ assert }) => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 10, 11, 15, 16, 21, 26, 31, 35].map(reform2023VacationDays),
      [12, 14, 16, 18, 20, 22, 22, 24, 24, 26, 28, 30, 32, 32]
    )
  })

  test('una fila por escala y año, de 1 al tope', ({ assert }) => {
    const rows = vacationScaleRows()
    assert.lengthOf(rows, VACATION_SCALE_MAX_YEARS * 2)
    assert.lengthOf(
      rows.filter((row) => row.applySince === PRE_REFORM_SCALE_APPLY_SINCE),
      VACATION_SCALE_MAX_YEARS
    )
    assert.lengthOf(
      rows.filter((row) => row.applySince === REFORM_2023_SCALE_APPLY_SINCE),
      VACATION_SCALE_MAX_YEARS
    )
    // El validador de captura acepta hasta 60 días: ninguna fila sembrada lo excede.
    assert.isAtMost(Math.max(...rows.map((row) => row.vacationDays)), 60)
  })
})
