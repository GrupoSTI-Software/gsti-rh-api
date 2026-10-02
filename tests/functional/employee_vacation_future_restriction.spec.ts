import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import SystemSetting from '#models/system_setting'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'
import { EMPLOYEE_VACATION_PERIOD_ERROR_CODES } from '#constants/employee_vacation_period_error_codes'

/**
 * Regla de la empresa "no adelantar vacaciones" en el alta directa de días.
 *
 * El ingreso se fija un mes después de hoy hace cinco años: el período de 5
 * años de servicio ya inició y el de 6 inicia dentro de once meses.
 */
const REJECTION_KEY = 'periodo-de-vacaciones-no-iniciado'

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null
let systemSettingId = 0
let vacationTypeId = 0
const settingIdByYears = new Map<number, number>()

async function setRestriction(value: 0 | 1): Promise<void> {
  await db
    .from('system_settings')
    .where('system_setting_id', systemSettingId)
    .update({ system_setting_restrict_future_vacation: value })
}

async function registerDay(client: ApiClient, years: number) {
  return client
    .post('/api/shift-exception')
    .json({
      employeeId: fixture!.employee.employeeId,
      exceptionTypeId: vacationTypeId,
      vacationSettingId: settingIdByYears.get(years),
      shiftExceptionsDate: DateTime.now().plus({ days: 7 }).toISODate(),
      shiftExceptionsDescription: 'Vacaciones',
      daysToApply: 1,
    })
    .loginAs(actor!.user)
    .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
}

test.group('No adelantar vacaciones en el alta directa', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'vacadelanto')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'vacadelanto')
    const hireDate = DateTime.now().minus({ years: 5, months: 1 }).toISODate()
    await db
      .from('employees')
      .where('employee_id', fixture.employee.employeeId)
      .update({ employee_hire_date: hireDate })

    const setting = await SystemSetting.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      systemSettingTradeName: `vacadelanto-${Date.now()}`,
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
      systemSettingRestrictFutureVacation: 1,
    })
    systemSettingId = setting.systemSettingId

    const type = await db
      .from('exception_types')
      .where('exception_type_slug', 'vacation')
      .whereNull('exception_type_deleted_at')
      .first()
    vacationTypeId = Number(type.exception_type_id)
    for (const years of [5, 6]) {
      const catalog = await db
        .from('vacation_settings')
        .whereNull('vacation_setting_deleted_at')
        .where('vacation_setting_years_of_service', years)
        .where('vacation_setting_crew', 0)
        .first()
      settingIdByYears.set(years, Number(catalog.vacation_setting_id))
    }

    return async () => {
      await db.from('shift_exceptions').where('employee_id', fixture!.employee.employeeId).delete()
      await db
        .from('employee_assist_calendars')
        .where('employee_id', fixture!.employee.employeeId)
        .delete()
      await db.from('system_settings').where('system_setting_id', systemSettingId).delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('rechaza el alta en un período que aún no inicia', async ({ client, assert }) => {
    await setRestriction(1)
    const response = await registerDay(client, 6)

    response.assertStatus(422)
    assert.equal(response.body().key, REJECTION_KEY)
    assert.equal(response.body().code, EMPLOYEE_VACATION_PERIOD_ERROR_CODES.VAL_PERIOD_NOT_STARTED)
    const created = await db
      .from('shift_exceptions')
      .where('employee_id', fixture!.employee.employeeId)
      .where('vacation_setting_id', settingIdByYears.get(6)!)
    assert.lengthOf(created, 0)
  })

  test('el período vigente no se toca con la regla activa', async ({ client, assert }) => {
    await setRestriction(1)
    const response = await registerDay(client, 5)
    // Pasa la guarda; el día no se crea porque el colaborador de prueba no
    // tiene turno, y eso no es lo que se prueba aquí.
    response.assertStatus(201)
    assert.notEqual(response.body()?.key, REJECTION_KEY)
  })

  test('sin la regla se puede adelantar', async ({ client, assert }) => {
    await setRestriction(0)
    const response = await registerDay(client, 6)
    // Pasa la guarda; el día no se crea porque el colaborador de prueba no
    // tiene turno, y eso no es lo que se prueba aquí.
    response.assertStatus(201)
    assert.notEqual(response.body()?.key, REJECTION_KEY)
  })
})
