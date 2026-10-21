import { test } from '@japa/runner'
import {
  EMPLOYEE_OFFBOARDING_REFERENCE_DATE_SQL,
  resolveOffboardingReferenceDate,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'

/**
 * VLRH-H1792172894406, regla 5: la ficha, Bajas de personal y la Matriz de
 * vencimientos muestran la misma fecha de baja. La función la resuelve en el
 * DTO y la gemela SQL en la consulta agregada; aquí se amarra que las dos
 * siguen la misma precedencia: copia de la baja deshecha > baja en vivo >
 * programada.
 */
test.group('resolveOffboardingReferenceDate (VLRH-H1792172894406)', () => {
  test('la copia de la baja deshecha manda sobre la baja en vivo y la programada', ({ assert }) => {
    assert.equal(
      resolveOffboardingReferenceDate({
        snapshotDate: '2026-08-10',
        liveTerminatedDate: '2026-09-15',
        plannedDate: '2026-11-30',
      }),
      '2026-08-10'
    )
  })

  test('sin copia, la baja en vivo manda sobre la programada', ({ assert }) => {
    assert.equal(
      resolveOffboardingReferenceDate({
        snapshotDate: null,
        liveTerminatedDate: '2026-09-15',
        plannedDate: '2026-11-30',
      }),
      '2026-09-15'
    )
  })

  test('sin copia ni baja en vivo, queda la programada; sin ninguna, null', ({ assert }) => {
    assert.equal(
      resolveOffboardingReferenceDate({
        snapshotDate: null,
        liveTerminatedDate: null,
        plannedDate: '2026-11-30',
      }),
      '2026-11-30'
    )
    assert.isNull(
      resolveOffboardingReferenceDate({
        snapshotDate: null,
        liveTerminatedDate: null,
        plannedDate: null,
      })
    )
  })

  test('la gemela SQL nombra las tres columnas en el mismo orden y con los alias eo y e', ({
    assert,
  }) => {
    const columns = [
      'eo.employee_offboarding_termination_date',
      'e.employee_terminated_date',
      'eo.employee_offboarding_planned_date',
    ]
    assert.equal(EMPLOYEE_OFFBOARDING_REFERENCE_DATE_SQL, `COALESCE(${columns.join(', ')})`)
  })
})
