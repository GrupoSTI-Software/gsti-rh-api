import { test } from '@japa/runner'
import OverridesService from '#modules/working-time-rules/overrides/overrides.service'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'
import type { OverridesRepository } from '#modules/working-time-rules/overrides/overrides.repository'
import type { CreateOverrideInput } from '#modules/working-time-rules/overrides/dto/override.dto'
import type WorkingTimeRule from '#models/working_time_rule'

/**
 * Tests unitarios de la lógica de negocio de overrides (sin BD).
 *
 * Se inyecta un repositorio falso para controlar el federal de referencia y
 * capturar lo que se intentaría persistir, sin tocar MySQL.
 */

/** Federal de referencia: 46 h semanales (MX 2027). */
function federalRule(): WorkingTimeRule {
  return {
    workingTimeRuleMaxWeeklyHours: 46,
    workingTimeRuleMaxWeeklyOvertimeHours: 9,
    workingTimeRuleMaxDailyOvertimeHours: 4,
    workingTimeRuleMaxOvertimeDaysPerWeek: 4,
    workingTimeRuleDailyHoursDay: 8,
    workingTimeRuleDailyHoursNight: 7,
    workingTimeRuleDailyHoursMixed: 7.5,
    workingTimeRuleWorkDaysPerRestDay: 6,
  } as WorkingTimeRule
}

/** Repositorio falso: devuelve un federal fijo y captura el create. */
class FakeRepo implements OverridesRepository {
  created: Partial<WorkingTimeRule> = {}
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly federal: WorkingTimeRule | null) {}
  async listByBusinessUnit() {
    return []
  }
  async findOverrideById() {
    return null
  }
  async findFederalForDate() {
    return this.federal
  }
  async create(attributes: Partial<WorkingTimeRule>) {
    this.created = attributes
    return attributes as WorkingTimeRule
  }
  async update(_rule: WorkingTimeRule, attributes: Partial<WorkingTimeRule>) {
    return attributes as WorkingTimeRule
  }
  async softDelete() {
    await Promise.resolve()
  }
}

function baseInput(overrides: Partial<CreateOverrideInput> = {}): CreateOverrideInput {
  return {
    businessUnitId: 5,
    effectiveYear: 2027,
    validFrom: '2027-01-01',
    validTo: '2027-12-31',
    maxWeeklyHours: 40,
    maxWeeklyOvertimeHours: 9,
    maxDailyOvertimeHours: 4,
    maxOvertimeDaysPerWeek: 4,
    dailyHoursDay: 8,
    dailyHoursNight: 7,
    dailyHoursMixed: 7.5,
    workDaysPerRestDay: 6,
    exceedsFederalAck: false,
    overrideJustification: null,
    ...overrides,
  }
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error
  }
}

test.group('OverridesService — reglas de negocio', () => {
  test('cap de sanidad: jornada semanal > 60 se rechaza aun con bandera', async ({ assert }) => {
    const service = new OverridesService(new FakeRepo(federalRule()))
    const error = await captureRejection(
      service.create(baseInput({ maxWeeklyHours: 65, exceedsFederalAck: true, overrideJustification: 'x' }), 1)
    )
    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'valor-fuera-de-rango')
  })

  test('cap de sanidad: HE semanal > 20 se rechaza aun con bandera', async ({ assert }) => {
    const service = new OverridesService(new FakeRepo(federalRule()))
    const error = await captureRejection(
      service.create(baseInput({ maxWeeklyOvertimeHours: 21, exceedsFederalAck: true, overrideJustification: 'x' }), 1)
    )
    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'valor-fuera-de-rango')
  })

  test('excede el federal sin bandera: 422 override-excede-federal', async ({ assert }) => {
    const service = new OverridesService(new FakeRepo(federalRule()))
    const error = await captureRejection(
      service.create(baseInput({ maxWeeklyHours: 50, exceedsFederalAck: false }), 1)
    )
    assert.instanceOf(error, WorkingTimeRuleError)
    assert.equal((error as WorkingTimeRuleError).key, 'override-excede-federal')
  })

  test('excede el federal con bandera + justificación: persiste exceeds, autor y justificación', async ({ assert }) => {
    const repo = new FakeRepo(federalRule())
    const service = new OverridesService(repo)
    await service.create(
      baseInput({ maxWeeklyHours: 50, exceedsFederalAck: true, overrideJustification: 'Política interna' }),
      99
    )
    assert.isTrue(repo.created.workingTimeRuleExceedsFederal)
    assert.equal(repo.created.workingTimeRuleOverrideJustification, 'Política interna')
    assert.equal(repo.created.overrideCreatedByUserId, 99)
    assert.equal(repo.created.businessUnitId, 5)
  })

  test('override menor o igual al federal: no marca exceeds ni guarda autor', async ({ assert }) => {
    const repo = new FakeRepo(federalRule())
    const service = new OverridesService(repo)
    await service.create(baseInput({ maxWeeklyHours: 40 }), 99)
    assert.isFalse(repo.created.workingTimeRuleExceedsFederal)
    assert.isNull(repo.created.workingTimeRuleOverrideJustification)
    assert.isNull(repo.created.overrideCreatedByUserId)
  })
})
