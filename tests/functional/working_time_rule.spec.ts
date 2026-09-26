import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import WorkingTimeRule from '#models/working_time_rule'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'

/**
 * Tests de integración de WorkingTimeRule contra la base de datos.
 *
 * `assertNoOverlap` consulta la tabla, por lo que requiere conexión real. Para no
 * interferir con los registros federales del seeder (country_code MX), estos tests
 * usan un country_code de prueba ('XX') y limpian sus propias filas.
 *
 * Cubre los criterios:
 *  - se rechaza una vigencia solapada con key 'vigencia-solapada' y no se persiste.
 *  - el upsert por clave natural (country_code, effective_year) es idempotente.
 */

const TEST_COUNTRY = 'XX'

/** Construye un payload de regla de prueba para un año y rango de vigencia dados. */
function makeRow(year: number, from: string, to: string | null) {
  return {
    workingTimeRuleCountryCode: TEST_COUNTRY,
    workingTimeRuleEffectiveYear: year,
    workingTimeRuleValidFrom: DateTime.fromISO(from),
    workingTimeRuleValidTo: to ? DateTime.fromISO(to) : null,
    workingTimeRuleMaxWeeklyHours: 48,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
    workingTimeRuleSalaryProtection: true,
  }
}

async function countTestRows(): Promise<number> {
  const result = await db
    .from('working_time_rules')
    .where('working_time_rule_country_code', TEST_COUNTRY)
    .count('* as total')
  return Number(result[0].total)
}

async function cleanupTestRows() {
  // Borrado físico (bypassa el soft delete) para dejar la tabla limpia entre tests.
  await db.from('working_time_rules').where('working_time_rule_country_code', TEST_COUNTRY).delete()
}

test.group('WorkingTimeRule — vigencias y upsert (BD)', (group) => {
  group.each.setup(async () => {
    await cleanupTestRows()
    return () => cleanupTestRows()
  })

  test('rechaza una vigencia solapada y no la persiste', async ({ assert }) => {
    await WorkingTimeRule.create(makeRow(2026, '2026-01-01', '2026-12-31'))

    // Rango que cruza con 2026 (jun-2026 a jun-2027).
    let captured: unknown = null
    try {
      await WorkingTimeRule.create(makeRow(2099, '2026-06-01', '2027-06-01'))
    } catch (error) {
      captured = error
    }

    assert.instanceOf(captured, WorkingTimeRuleError)
    assert.equal((captured as WorkingTimeRuleError).key, 'vigencia-solapada')
    assert.equal((captured as WorkingTimeRuleError).title, 'Vigencia solapada')

    // No se persistió la regla solapada: sigue habiendo una sola fila de prueba.
    assert.equal(await countTestRows(), 1)
  })

  test('vigencias consecutivas no se consideran solapadas', async ({ assert }) => {
    await WorkingTimeRule.create(makeRow(2026, '2026-01-01', '2026-12-31'))
    await assert.doesNotReject(() =>
      WorkingTimeRule.create(makeRow(2027, '2027-01-01', '2027-12-31'))
    )
    assert.equal(await countTestRows(), 2)
  })

  test('valid_to nulo (indefinido) detecta solapamiento posterior', async ({ assert }) => {
    await WorkingTimeRule.create(makeRow(2030, '2030-01-01', null))

    let captured: unknown = null
    try {
      await WorkingTimeRule.create(makeRow(2099, '2031-01-01', '2031-12-31'))
    } catch (error) {
      captured = error
    }

    assert.instanceOf(captured, WorkingTimeRuleError)
    assert.equal((captured as WorkingTimeRuleError).key, 'vigencia-solapada')
  })

  test('upsert por clave natural es idempotente (no duplica)', async ({ assert }) => {
    const naturalKey = {
      workingTimeRuleCountryCode: TEST_COUNTRY,
      workingTimeRuleEffectiveYear: 2026,
    }
    const payload = makeRow(2026, '2026-01-01', '2026-12-31')

    await WorkingTimeRule.updateOrCreate(naturalKey, payload)
    await WorkingTimeRule.updateOrCreate(naturalKey, payload)

    assert.equal(await countTestRows(), 1)
  })
})
