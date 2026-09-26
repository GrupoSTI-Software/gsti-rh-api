import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import OverridesService from '#modules/working-time-rules/overrides/overrides.service'
import WorkingTimeRuleError from '#exceptions/working_time_rule_error'
import type { CreateOverrideInput } from '#modules/working-time-rules/overrides/dto/override.dto'

/**
 * Tests de integración del servicio de overrides contra la BD.
 *
 * Crea una unidad de negocio de prueba y opera el servicio real (repositorio
 * Lucid). Cubre que la creación pueble business_unit_id y que el no-traslape
 * por empresa se rechace con 'vigencia-solapada'. Los casos de excede-federal y
 * cap de sanidad se cubren en el test unitario del servicio.
 */

let businessUnitId = 0

function baseInput(overrides: Partial<CreateOverrideInput> = {}): CreateOverrideInput {
  return {
    businessUnitId,
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

async function cleanupRules() {
  await db.from('working_time_rules').where('business_unit_id', businessUnitId).delete()
}

test.group('OverridesService — integración (BD)', (group) => {
  group.setup(async () => {
    const bu = await BusinessUnit.create({
      businessUnitName: 'WTR Override Test BU',
      businessUnitSlug: `wtr-override-test-${Date.now()}`,
      businessUnitLegalName: 'WTR Override Test BU SA de CV',
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

  test('crea el override con business_unit_id poblado', async ({ assert }) => {
    const service = new OverridesService()
    const created = await service.create(baseInput(), 1)

    assert.equal(created.businessUnitId, businessUnitId)
    assert.isAbove(created.workingTimeRuleId, 0)
    assert.isFalse(created.workingTimeRuleExceedsFederal)
  })

  test('rechaza un override con vigencia solapada de la misma empresa', async ({ assert }) => {
    const service = new OverridesService()
    await service.create(baseInput(), 1)

    let captured: unknown = null
    try {
      // Rango que cruza con el override 2027 ya existente.
      await service.create(
        baseInput({ effectiveYear: 2099, validFrom: '2027-06-01', validTo: '2028-06-01' }),
        1
      )
    } catch (error) {
      captured = error
    }

    assert.instanceOf(captured, WorkingTimeRuleError)
    assert.equal((captured as WorkingTimeRuleError).key, 'vigencia-solapada')

    const remaining = await db
      .from('working_time_rules')
      .where('business_unit_id', businessUnitId)
      .count('* as total')
    assert.equal(Number(remaining[0].total), 1)
  })
})
