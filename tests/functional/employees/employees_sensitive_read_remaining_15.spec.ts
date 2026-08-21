import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  empresaRfcFromShow,
  expectAmountNull,
  expectMaskedHealth,
  expectNeverDenied,
  firstSalaryDaily,
  grantModuleAction,
  grantOnly,
  rangeAmounts,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

test.group('Lectura sensible — 15 columnas restantes — HTTP', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens-read-15')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens15')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.teardown(async () => {
    try {
      await cleanupRemainingSensitiveFixture(extra)
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: GET nota de incapacidad sin grants sensibles responde 200', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })

  test('CA-3: sin financiero los importes van null, nunca mascara parcial', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    expectAmountNull(firstSalaryDaily(salaryRes.body()), assert)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(rangeRes, assert)
    const amounts = rangeAmounts(rangeRes.body())
    expectAmountNull(amounts.min, assert)
    expectAmountNull(amounts.max, assert)
  })

  test('CA-3: con sensitive-financiero-read los importes son number', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    assert.equal(firstSalaryDaily(salaryRes.body()), CLEAR_REMAINING.salaryDaily)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const amounts = rangeAmounts(rangeRes.body())
    assert.equal(amounts.min, CLEAR_REMAINING.minSalaryDaily)
    assert.equal(amounts.max, CLEAR_REMAINING.maxSalaryDaily)
  })

  test('CA-2: RFC de empresa contratante se enmascara sin identificacion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(
      empresaRfcFromShow(response.body()),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )
  })

  test('CA-2: RFC de empresa contratante llega en claro con identificacion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-identificacion-read'])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(empresaRfcFromShow(response.body()), CLEAR_REMAINING.empresaRfc)
  })
})
