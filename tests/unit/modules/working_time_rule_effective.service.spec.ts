import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import EffectiveService from '#modules/working-time-rules/effective/effective.service'
import { workingTimeRuleCache } from '#services/working_time_rule_cache_service'
import type { EffectiveRepository } from '#modules/working-time-rules/effective/effective.repository'
import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Tests unitarios de la resolución de jornada efectiva (sin BD).
 *
 * Se inyecta un repositorio falso para controlar el federal y el override, y se
 * limpia la caché singleton entre casos para aislar el comportamiento.
 */

/** Federal MX vigente 2027 (46 h semanales), valid_to abierto. */
function federalRule(): WorkingTimeRule {
  return {
    workingTimeRuleEffectiveYear: 2027,
    workingTimeRuleValidFrom: DateTime.fromISO('2027-01-01'),
    workingTimeRuleValidTo: null,
    workingTimeRuleMaxWeeklyHours: 46,
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

/** Override de empresa que excede el federal (50 h semanales). */
function overrideRule(): WorkingTimeRule {
  return {
    workingTimeRuleEffectiveYear: 2027,
    workingTimeRuleValidFrom: DateTime.fromISO('2027-01-01'),
    workingTimeRuleValidTo: DateTime.fromISO('2027-12-31'),
    workingTimeRuleMaxWeeklyHours: 50,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
    workingTimeRuleSalaryProtection: true,
    workingTimeRuleExceedsFederal: true,
  } as WorkingTimeRule
}

/** Repositorio falso configurable. */
class FakeRepo implements EffectiveRepository {
  constructor(
    // eslint-disable-next-line no-unused-vars
    private override: WorkingTimeRule | null,
    // eslint-disable-next-line no-unused-vars
    private readonly federal: WorkingTimeRule | null
  ) {}
  setOverride(value: WorkingTimeRule | null) {
    this.override = value
  }
  async findOverrideForDate() {
    return this.override
  }
  async findFederalCandidates() {
    return this.federal ? [this.federal] : []
  }
}

test.group('EffectiveService — getRulesForDate', (group) => {
  group.each.setup(() => {
    workingTimeRuleCache.flushAll()
  })

  test('con override vigente: source override, baseline federal y exceedsFederal', async ({ assert }) => {
    const service = new EffectiveService(new FakeRepo(overrideRule(), federalRule()))
    const result = await service.getRulesForDate(5, '2027-03-15')

    assert.equal(result.source, 'override')
    assert.equal(result.effective?.maxWeeklyHours, 50)
    assert.equal(result.federalBaseline?.maxWeeklyHours, 46)
    assert.isTrue(result.exceedsFederal)
  })

  test('sin override: source federal y baseline igual al federal', async ({ assert }) => {
    const service = new EffectiveService(new FakeRepo(null, federalRule()))
    const result = await service.getRulesForDate(5, '2027-03-15')

    assert.equal(result.source, 'federal')
    assert.equal(result.effective?.maxWeeklyHours, 46)
    assert.equal(result.federalBaseline?.maxWeeklyHours, 46)
    assert.isFalse(result.exceedsFederal)
  })

  test('sin federal ni override: effective null sin excepción', async ({ assert }) => {
    const service = new EffectiveService(new FakeRepo(null, null))
    const result = await service.getRulesForDate(5, '2027-03-15')

    assert.isNull(result.source)
    assert.isNull(result.effective)
    assert.isNull(result.federalBaseline)
  })

  test('caché invalidada por empresa refleja el cambio del override', async ({ assert }) => {
    const repo = new FakeRepo(null, federalRule())
    const service = new EffectiveService(repo)

    const first = await service.getRulesForDate(5, '2027-03-15')
    assert.equal(first.source, 'federal')

    // Simula un cambio en el CRUD: ahora hay override + invalidación de la empresa.
    repo.setOverride(overrideRule())
    workingTimeRuleCache.invalidateBusinessUnit(5)

    const second = await service.getRulesForDate(5, '2027-03-15')
    assert.equal(second.source, 'override')
    assert.equal(second.effective?.maxWeeklyHours, 50)
  })

  test('caché vigente devuelve el valor previo si no se invalida', async ({ assert }) => {
    const repo = new FakeRepo(null, federalRule())
    const service = new EffectiveService(repo)

    const first = await service.getRulesForDate(5, '2027-03-15')
    assert.equal(first.source, 'federal')

    // Cambio sin invalidar: la caché sirve el valor viejo.
    repo.setOverride(overrideRule())
    const second = await service.getRulesForDate(5, '2027-03-15')
    assert.equal(second.source, 'federal')
  })
})
