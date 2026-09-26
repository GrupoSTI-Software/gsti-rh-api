import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import WorkingTimeRule from '#models/working_time_rule'
import FederalService from '#modules/working-time-rules/federal/federal.service'

/**
 * Tests de integración del catálogo federal contra la BD (repositorio Lucid real).
 *
 * Cubre lo que el unitario del service no toca: el filtro business_unit_id null,
 * la exclusión de registros con soft delete y el orden valid_from ascendente.
 * Usa un countryCode aislado ('XX') para no interferir con el seed federal (MX).
 */

const TEST_COUNTRY = 'XX'
let businessUnitId = 0

/** Crea una regla federal (business_unit_id null) de prueba. */
async function createFederal(year: number, weekly: number): Promise<WorkingTimeRule> {
  return WorkingTimeRule.create({
    workingTimeRuleCountryCode: TEST_COUNTRY,
    businessUnitId: null,
    workingTimeRuleEffectiveYear: year,
    workingTimeRuleValidFrom: DateTime.fromObject({ year, month: 1, day: 1 }),
    workingTimeRuleValidTo: DateTime.fromObject({ year, month: 12, day: 31 }),
    workingTimeRuleMaxWeeklyHours: weekly,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
    workingTimeRuleSalaryProtection: true,
  })
}

async function cleanupRules() {
  await db.from('working_time_rules').where('working_time_rule_country_code', TEST_COUNTRY).delete()
}

test.group('FederalService — integración (BD)', (group) => {
  group.setup(async () => {
    const bu = await BusinessUnit.create({
      businessUnitName: 'WTR Federal Test BU',
      businessUnitSlug: `wtr-federal-test-${Date.now()}`,
      businessUnitLegalName: 'WTR Federal Test BU SA de CV',
      businessUnitActive: 1,
    })
    businessUnitId = bu.businessUnitId

    return async () => {
      await cleanupRules()
      await db.from('business_units').where('business_unit_id', businessUnitId).delete()
    }
  })

  group.each.setup(() => {
    return () => cleanupRules()
  })

  test('devuelve solo reglas federales (business_unit_id null), ordenadas por valid_from ASC', async ({
    assert,
  }) => {
    // Insertadas desordenadas a propósito para verificar el orden de salida.
    await createFederal(2042, 44)
    await createFederal(2040, 48)
    await createFederal(2041, 46)

    // Un override de empresa (business_unit_id no nulo) NO debe aparecer.
    await WorkingTimeRule.create({
      workingTimeRuleCountryCode: TEST_COUNTRY,
      businessUnitId,
      workingTimeRuleEffectiveYear: 2040,
      workingTimeRuleValidFrom: DateTime.fromObject({ year: 2040, month: 1, day: 1 }),
      workingTimeRuleValidTo: DateTime.fromObject({ year: 2040, month: 12, day: 31 }),
      workingTimeRuleMaxWeeklyHours: 40,
      workingTimeRuleMaxWeeklyOvertimeHours: 9,
      workingTimeRuleMaxDailyOvertimeHours: 4,
      workingTimeRuleMaxOvertimeDaysPerWeek: 4,
      workingTimeRuleDailyHoursDay: 8,
      workingTimeRuleDailyHoursNight: 7,
      workingTimeRuleDailyHoursMixed: 7.5,
      workingTimeRuleWorkDaysPerRestDay: 6,
      workingTimeRuleSalaryProtection: true,
    })

    const data = await new FederalService().listFederalRules(TEST_COUNTRY)

    assert.lengthOf(data, 3)
    assert.deepEqual(
      data.map((r) => r.effectiveYear),
      [2040, 2041, 2042]
    )
    assert.deepEqual(
      data.map((r) => r.maxWeeklyHours),
      [48, 46, 44]
    )
  })

  test('excluye reglas federales con soft delete', async ({ assert }) => {
    await createFederal(2040, 48)
    const deleted = await createFederal(2041, 46)
    await deleted.delete()

    const data = await new FederalService().listFederalRules(TEST_COUNTRY)

    assert.lengthOf(data, 1)
    assert.equal(data[0].effectiveYear, 2040)
  })

  test('valid_to nulo se expone como null (vigencia indefinida)', async ({ assert }) => {
    const indefinite = await createFederal(2040, 48)
    indefinite.workingTimeRuleValidTo = null
    await indefinite.save()

    const data = await new FederalService().listFederalRules(TEST_COUNTRY)

    assert.lengthOf(data, 1)
    assert.isNull(data[0].validTo)
    assert.equal(data[0].workingTimeRuleId, indefinite.workingTimeRuleId)
  })

  test('país sin reglas devuelve arreglo vacío', async ({ assert }) => {
    const data = await new FederalService().listFederalRules('ZZ')
    assert.lengthOf(data, 0)
  })
})
