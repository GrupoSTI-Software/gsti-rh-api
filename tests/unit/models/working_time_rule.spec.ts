import { test } from '@japa/runner'
import WorkingTimeRule from '#models/working_time_rule'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'

/**
 * Tests unitarios de la validación de valores de WorkingTimeRule.
 *
 * `assertValidValues` es lógica pura (no consulta la base de datos), por lo que se
 * puede invocar directamente con un objeto mock sin necesidad de conexión a MySQL.
 * Cubre el criterio: "valores no válidos se rechazan y no se persisten".
 */

/** Construye un mock con valores federales válidos (MX 2026) y permite sobrescribir. */
function makeRule(overrides: Partial<WorkingTimeRule> = {}): WorkingTimeRule {
  return {
    workingTimeRuleCountryCode: 'MX',
    workingTimeRuleEffectiveYear: 2026,
    workingTimeRuleMaxWeeklyHours: 48,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
    ...overrides,
  } as WorkingTimeRule
}

/** Captura el error lanzado por una función síncrona, o null si no lanzó. */
function captureError(fn: () => void): unknown {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

test.group('WorkingTimeRule — validación de valores', () => {
  test('jornada semanal en cero se rechaza con key valores-invalidos', ({ assert }) => {
    const error = captureError(() =>
      WorkingTimeRule.assertValidValues(makeRule({ workingTimeRuleMaxWeeklyHours: 0 }))
    )

    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'valores-invalidos')
    assert.equal((error as WorkingTimeRuleError).title, 'Valores inválidos')
  })

  test('jornada semanal negativa se rechaza', ({ assert }) => {
    const error = captureError(() =>
      WorkingTimeRule.assertValidValues(makeRule({ workingTimeRuleMaxWeeklyHours: -5 }))
    )

    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'valores-invalidos')
  })

  test('un parámetro numérico negativo (horas extra) se rechaza', ({ assert }) => {
    const error = captureError(() =>
      WorkingTimeRule.assertValidValues(makeRule({ workingTimeRuleMaxWeeklyOvertimeHours: -1 }))
    )

    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'valores-invalidos')
  })

  test('una jornada diaria negativa se rechaza', ({ assert }) => {
    const error = captureError(() =>
      WorkingTimeRule.assertValidValues(makeRule({ workingTimeRuleDailyHoursNight: -7 }))
    )

    assert.instanceOf(error, WorkingTimeRuleError)
  })

  test('valores federales válidos no lanzan error', ({ assert }) => {
    assert.doesNotThrow(() => WorkingTimeRule.assertValidValues(makeRule()))
  })
})
