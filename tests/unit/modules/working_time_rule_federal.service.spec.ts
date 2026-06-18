import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import FederalService from '#modules/working-time-rules/federal/federal.service'
import type { FederalRepository } from '#modules/working-time-rules/federal/federal.repository'
import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Tests unitarios del catálogo federal (sin BD).
 *
 * Se inyecta un repositorio falso para controlar las reglas devueltas y verificar
 * el mapeo a DTO y la propagación del orden tal cual lo entrega el repositorio.
 */

/** Regla federal mínima para un año dado. */
function federalRule(
  id: number,
  year: number,
  weekly: number,
  validTo: string | null
): WorkingTimeRule {
  return {
    workingTimeRuleId: id,
    workingTimeRuleCountryCode: 'MX',
    workingTimeRuleEffectiveYear: year,
    workingTimeRuleValidFrom: DateTime.fromISO(`${year}-01-01`),
    workingTimeRuleValidTo: validTo ? DateTime.fromISO(validTo) : null,
    workingTimeRuleMaxWeeklyHours: weekly,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
    workingTimeRuleSalaryProtection: true,
    workingTimeRuleExceedsFederal: false,
  } as WorkingTimeRule
}

/** Repositorio falso que devuelve una lista fija. */
class FakeRepo implements FederalRepository {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly rules: WorkingTimeRule[]) {}
  async listFederalRules() {
    return this.rules
  }
}

test.group('FederalService — listFederalRules', () => {
  test('mapea cada regla al DTO con id, countryCode y topes normalizados', async ({ assert }) => {
    const service = new FederalService(new FakeRepo([federalRule(1, 2026, 48, '2026-12-31')]))
    const data = await service.listFederalRules()

    assert.lengthOf(data, 1)
    assert.deepEqual(data[0], {
      workingTimeRuleId: 1,
      countryCode: 'MX',
      effectiveYear: 2026,
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      maxWeeklyHours: 48,
      maxWeeklyOvertimeHours: 9,
      maxDailyOvertimeHours: 4,
      maxOvertimeDaysPerWeek: 4,
      dailyHoursDay: 8,
      dailyHoursNight: 7,
      dailyHoursMixed: 7.5,
      workDaysPerRestDay: 6,
      salaryProtection: true,
    })
  })

  test('preserva el orden que entrega el repositorio (valid_from ascendente)', async ({
    assert,
  }) => {
    const service = new FederalService(
      new FakeRepo([
        federalRule(1, 2026, 48, '2026-12-31'),
        federalRule(2, 2027, 46, '2027-12-31'),
        federalRule(3, 2028, 44, '2028-12-31'),
      ])
    )
    const data = await service.listFederalRules()

    assert.deepEqual(
      data.map((r) => r.effectiveYear),
      [2026, 2027, 2028]
    )
  })

  test('valid_to nulo se expone como null (vigencia indefinida)', async ({ assert }) => {
    const service = new FederalService(new FakeRepo([federalRule(5, 2030, 40, null)]))
    const data = await service.listFederalRules()

    assert.isNull(data[0].validTo)
  })

  test('catálogo vacío devuelve arreglo vacío', async ({ assert }) => {
    const service = new FederalService(new FakeRepo([]))
    const data = await service.listFederalRules()

    assert.lengthOf(data, 0)
  })
})
