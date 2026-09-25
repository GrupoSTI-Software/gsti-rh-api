import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PiiAccessLogService from '#services/pii_access_log_service'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupRevealLogs,
  cleanupSensitiveFixture,
  countRevealLogSubjects,
  countRevealLogs,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  grantAcrossModules,
  lastRevealLog,
  CLEAR_REMAINING,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './pii_permission_gate_support.js'

const SALARY_AMOUNT_PAIRS = [
  { model: 'Employee', column: 'dailySalary' },
  { model: 'EmployeeSalaryHistory', column: 'salaryDaily' },
  { model: 'PositionSalaryRange', column: 'minSalaryDaily' },
  { model: 'PositionSalaryRange', column: 'maxSalaryDaily' },
  { model: 'PositionSalaryRangeAudit', column: 'oldMinSalaryDaily' },
  { model: 'PositionSalaryRangeAudit', column: 'oldMaxSalaryDaily' },
  { model: 'PositionSalaryRangeAudit', column: 'newMinSalaryDaily' },
  { model: 'PositionSalaryRangeAudit', column: 'newMaxSalaryDaily' },
] as const

function recordIdFor(model: string, fixture: SensitiveFixture, extra: RemainingSensitiveFixture): number {
  if (model === 'Employee') return fixture.employee.employeeId
  if (model === 'EmployeeSalaryHistory') return extra.salary.employeeSalaryHistoryId
  if (model === 'PositionSalaryRange') return extra.range.positionSalaryRangeId
  if (model === 'PositionSalaryRangeAudit') return extra.rangeAudit.positionSalaryRangeAuditId
  throw new Error(`Modelo sin recordId mapeado: ${model}`)
}

test.group('Revelado de importes salariales (USRH1788478865952)', (group) => {
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-reveal-salary')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'pii-reveal-salary')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.each.teardown(async () => {
    if (actor) {
      await cleanupRevealLogs({ userId: actor.user.userId })
      await cleanupRevealLogs({ businessUnitId: actor.businessUnit.businessUnitId })
    }
    await cleanupRemainingSensitiveFixture(extra)
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    extra = null
    fixture = null
    actor = null
  })

  test('CA-1 — salario diario del trabajador revela número, asiento y titular', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-financiero-read'] },
    ])
    const recordId = fixture!.employee.employeeId
    const before = await countRevealLogs('Employee', 'dailySalary', recordId)

    const response = await client
      .get(`/api/v1/pii/reveal/Employee/dailySalary/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'employees')

    response.assertStatus(200)
    assert.equal(typeof response.body().data.dailySalary, 'number')
    assert.equal(response.body().data.dailySalary, CLEAR_REMAINING.employeeDailySalary)
    assert.equal(await countRevealLogs('Employee', 'dailySalary', recordId), before + 1)

    const log = await lastRevealLog('Employee', 'dailySalary', recordId)
    assert.isNotNull(log)
    assert.equal(log!.originModule, 'employees')
    assert.equal(await countRevealLogSubjects(log!.piiAccessLogId), 1)
    const subjectRow = await db
      .from('pii_access_log_subjects')
      .where('pii_access_log_id', log!.piiAccessLogId)
      .first()
    assert.equal(Number(subjectRow!.employee_id), recordId)
  })

  test('CA-2 — movimiento del historial salarial revela número, asiento y titular', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-financiero-read'] },
    ])
    const recordId = extra!.salary.employeeSalaryHistoryId
    const employeeId = fixture!.employee.employeeId
    const before = await countRevealLogs('EmployeeSalaryHistory', 'salaryDaily', recordId)

    const response = await client
      .get(`/api/v1/pii/reveal/EmployeeSalaryHistory/salaryDaily/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(200)
    assert.equal(response.body().data.salaryDaily, CLEAR_REMAINING.salaryDaily)
    assert.equal(await countRevealLogs('EmployeeSalaryHistory', 'salaryDaily', recordId), before + 1)

    const log = await lastRevealLog('EmployeeSalaryHistory', 'salaryDaily', recordId)
    assert.isNotNull(log)
    assert.equal(await countRevealLogSubjects(log!.piiAccessLogId), 1)
    const subjectRow = await db
      .from('pii_access_log_subjects')
      .where('pii_access_log_id', log!.piiAccessLogId)
      .first()
    assert.equal(Number(subjectRow!.employee_id), employeeId)
  })

  test('CA-3 — topes del rango salarial revelan número sin titular', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-financiero-read'] },
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const recordId = extra!.range.positionSalaryRangeId
    const employeeId = fixture!.employee.employeeId

    const minBefore = await countRevealLogs('PositionSalaryRange', 'minSalaryDaily', recordId)
    const minResponse = await client
      .get(`/api/v1/pii/reveal/PositionSalaryRange/minSalaryDaily/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'positions')
    minResponse.assertStatus(200)
    assert.equal(minResponse.body().data.minSalaryDaily, CLEAR_REMAINING.minSalaryDaily)
    assert.equal(await countRevealLogs('PositionSalaryRange', 'minSalaryDaily', recordId), minBefore + 1)

    const maxBefore = await countRevealLogs('PositionSalaryRange', 'maxSalaryDaily', recordId)
    const maxResponse = await client
      .get(`/api/v1/pii/reveal/PositionSalaryRange/maxSalaryDaily/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'positions')
    maxResponse.assertStatus(200)
    assert.equal(maxResponse.body().data.maxSalaryDaily, CLEAR_REMAINING.maxSalaryDaily)
    assert.equal(await countRevealLogs('PositionSalaryRange', 'maxSalaryDaily', recordId), maxBefore + 1)

    const minLog = await lastRevealLog('PositionSalaryRange', 'minSalaryDaily', recordId)
    assert.equal(await countRevealLogSubjects(minLog!.piiAccessLogId), 0)

    const listResponse = await client
      .get('/api/v1/pii/access-logs')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    listResponse.assertStatus(200)
    const listRows = listResponse.body().data.data as Array<{
      field?: { model?: string; column?: string }
      subject?: unknown
    }>
    const rangeRow = listRows.find(
      (row) => row.field?.model === 'PositionSalaryRange' && row.field?.column === 'minSalaryDaily'
    )
    assert.isDefined(rangeRow)
    assert.notProperty(rangeRow!, 'subject')

    const filteredResponse = await client
      .get(`/api/v1/pii/access-logs?employeeId=${employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    filteredResponse.assertStatus(200)
    const filteredRows = filteredResponse.body().data.data as Array<{ field?: { model?: string } }>
    assert.isFalse(filteredRows.some((row) => row.field?.model === 'PositionSalaryRange'))
  })

  test('CA-4 — auditoría de rango revela cuatro columnas con nulls y números', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-financiero-read'] },
    ])
    const recordId = extra!.rangeAudit.positionSalaryRangeAuditId
    const expectations = [
      ['oldMinSalaryDaily', null],
      ['oldMaxSalaryDaily', null],
      ['newMinSalaryDaily', CLEAR_REMAINING.rangeAuditNewMinSalaryDaily],
      ['newMaxSalaryDaily', CLEAR_REMAINING.rangeAuditNewMaxSalaryDaily],
    ] as const

    for (const [column, expected] of expectations) {
      const before = await countRevealLogs('PositionSalaryRangeAudit', column, recordId)
      const response = await client
        .get(`/api/v1/pii/reveal/PositionSalaryRangeAudit/${column}/${recordId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
      assert.equal(response.body().data[column], expected)
      assert.equal(await countRevealLogs('PositionSalaryRangeAudit', column, recordId), before + 1)
    }
  })

  test('CA-5 — otra empresa, borrado e inexistente responden 404 sin asiento', async ({
    client,
    assert,
  }) => {
    const otherActor = await createActor('pii-reveal-salary-other')
    const otherFixture = await createSensitiveFixture(
      otherActor.businessUnit.businessUnitId,
      'pii-reveal-salary-other'
    )
    const otherExtra = await createRemainingSensitiveFixture(otherActor, otherFixture)
    try {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: ['sensitive-financiero-read'] },
      ])

      for (const { model, column } of SALARY_AMOUNT_PAIRS) {
        const crossId = recordIdFor(model, otherFixture, otherExtra)
        const beforeCross = await countRevealLogs(model, column, crossId)
        const crossResponse = await client
          .get(`/api/v1/pii/reveal/${model}/${column}/${crossId}`)
          .loginAs(actor!.user)
          .header('X-Business-Unit-Id', buHeader(actor!))
        crossResponse.assertStatus(404)
        assert.equal(await countRevealLogs(model, column, crossId), beforeCross)
      }

      const employeeId = fixture!.employee.employeeId
      await fixture!.employee.merge({ deletedAt: DateTime.now() }).save()
      const beforeDeleted = await countRevealLogs('Employee', 'dailySalary', employeeId)
      const deletedResponse = await client
        .get(`/api/v1/pii/reveal/Employee/dailySalary/${employeeId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      deletedResponse.assertStatus(404)
      assert.equal(await countRevealLogs('Employee', 'dailySalary', employeeId), beforeDeleted)

      await extra!.salary.merge({ deletedAt: DateTime.now() }).save()
      const historyId = extra!.salary.employeeSalaryHistoryId
      const beforeHistoryDeleted = await countRevealLogs(
        'EmployeeSalaryHistory',
        'salaryDaily',
        historyId
      )
      const historyDeletedResponse = await client
        .get(`/api/v1/pii/reveal/EmployeeSalaryHistory/salaryDaily/${historyId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      historyDeletedResponse.assertStatus(404)
      assert.equal(
        await countRevealLogs('EmployeeSalaryHistory', 'salaryDaily', historyId),
        beforeHistoryDeleted
      )

      const missingId = 9_999_999
      const beforeMissing = await countRevealLogs('PositionSalaryRange', 'minSalaryDaily', missingId)
      const missingResponse = await client
        .get(`/api/v1/pii/reveal/PositionSalaryRange/minSalaryDaily/${missingId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      missingResponse.assertStatus(404)
      assert.equal(
        await countRevealLogs('PositionSalaryRange', 'minSalaryDaily', missingId),
        beforeMissing
      )
    } finally {
      await cleanupRemainingSensitiveFixture(otherExtra)
      await cleanupSensitiveFixture(otherFixture)
      await cleanupActor(otherActor)
    }
  })

  test('CA-6 — sin permiso financiero responde 403 sin asiento ni filtraciones', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.employee.employeeId
    const before = await countRevealLogs('Employee', 'dailySalary', recordId)

    const existingResponse = await client
      .get(`/api/v1/pii/reveal/Employee/dailySalary/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    existingResponse.assertStatus(403)
    assert.equal(existingResponse.body().code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(existingResponse.body().key, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(existingResponse.body().detail, 'datos financieros')
    assert.notInclude(JSON.stringify(existingResponse.body()), String(CLEAR_REMAINING.employeeDailySalary))

    const missingResponse = await client
      .get('/api/v1/pii/reveal/Employee/dailySalary/9999999')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    missingResponse.assertStatus(403)
    assert.equal(missingResponse.body().code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(await countRevealLogs('Employee', 'dailySalary', recordId), before)
  })

  test('CA-7 — falla al escribir asiento responde 500 sin entregar el importe', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-financiero-read'] },
    ])
    const recordId = extra!.salary.employeeSalaryHistoryId
    const beforeLogs = await countRevealLogs('EmployeeSalaryHistory', 'salaryDaily', recordId)
    const originalRecord = PiiAccessLogService.prototype.record
    PiiAccessLogService.prototype.record = async () => {
      throw new Error('fallo simulado de auditoría salarial')
    }
    try {
      const response = await client
        .get(`/api/v1/pii/reveal/EmployeeSalaryHistory/salaryDaily/${recordId}`)
        .setup((request) => {
          request.request.ok(() => true)
        })
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(500)
      assert.notInclude(JSON.stringify(response.body()), String(CLEAR_REMAINING.salaryDaily))
      assert.equal(await countRevealLogs('EmployeeSalaryHistory', 'salaryDaily', recordId), beforeLogs)
    } finally {
      PiiAccessLogService.prototype.record = originalRecord
    }
  })
})
