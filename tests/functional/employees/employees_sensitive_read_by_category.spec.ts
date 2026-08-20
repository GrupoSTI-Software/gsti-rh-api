import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import PiiAccessLog from '#models/pii_access_log'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  cleanupSystemActor,
  createActor,
  createSensitiveFixture,
  createSystemActor,
  employeeBankBody,
  employeePerson,
  expectBankMasked,
  expectContactoClearIdentificacionMasked,
  expectElevenClear,
  expectElevenMasked,
  expectMedicalClear,
  expectMedicalMasked,
  expectNeverDenied,
  expectPersonContactoMasked,
  expectPersonIdentificacionMasked,
  expectNonSensitiveIntact,
  grantOnly,
  medicalConditionBody,
  restoreEmployeesGrants,
  snapshotAndClearEmployeesGrants,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

async function getThreeSurfaces(
  client: ApiClient,
  actor: TenantActor,
  fixture: SensitiveFixture
) {
  const header = buHeader(actor)
  const employeeRes = await client
    .get(`/api/employees/${fixture.employee.employeeId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const bankRes = await client
    .get(`/api/employee-banks/${fixture.bank.employeeBankId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const medicalRes = await client
    .get(
      `/api/employee-medical-conditions/${fixture.medical.employeeMedicalConditionId}`
    )
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  return { employeeRes, bankRes, medicalRes }
}

test.group('Lectura sensible por categoría — HTTP', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens-read-http')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-http')
  })

  group.teardown(async () => {
    try {
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: GET ficha sin grants sensibles responde 200 y deja el nombre en claro', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const body = response.body()
    const person = employeePerson(body)
    expectNonSensitiveIntact(person, body.data.employee, assert)
  })

  test('CA-4: sin lecturas sensibles las 11 van tapadas, el resto intacto y HTTP 200', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectNonSensitiveIntact(person, employeeRes.body().data.employee, assert)
    expectElevenMasked(
      person,
      employeeBankBody(bankRes.body()),
      medicalConditionBody(medicalRes.body()),
      fixture!.clear,
      assert
    )
  })

  test('solo sensitive-biometrico-read no destapa ninguna de las 11', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-biometrico-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectElevenMasked(
      employeePerson(employeeRes.body()),
      employeeBankBody(bankRes.body()),
      medicalConditionBody(medicalRes.body()),
      fixture!.clear,
      assert
    )
  })

  test('CA-1: solo sensitive-contacto-read destapa correo y teléfonos; el resto tapado; 200', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectContactoClearIdentificacionMasked(person, fixture!.clear, assert)
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
    expectNonSensitiveIntact(person, employeeRes.body().data.employee, assert)
  })

  test('CA-2: owner sin slugs sensibles y switch OFF recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const owner = await createSystemActor(
      'owner',
      'sens-owner',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(owner.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: owner.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenClear(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(owner)
    }
  })

  test('CA-2: root sin slugs sensibles y switch OFF recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const root = await createSystemActor(
      'root',
      'sens-root',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(root.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: root.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenClear(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(root)
    }
  })

  test('CA-2: super-administrador sin slugs recibe las 11 tapadas y 200', async ({
    client,
    assert,
  }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-dg',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(dg.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: dg.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenMasked(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(dg)
    }
  })

  test('CA-3: sensitive-salud-read destapa diagnóstico y notas; bitácora sin filas nuevas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-salud-read'])
    const before = await PiiAccessLog.query().where(
      'accessorUserId',
      actor!.user.userId
    )
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(medicalRes, assert)
    expectMedicalClear(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
    expectPersonContactoMasked(employeePerson(employeeRes.body()), fixture!.clear, assert)
    expectPersonIdentificacionMasked(
      employeePerson(employeeRes.body()),
      fixture!.clear,
      assert
    )
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    const after = await PiiAccessLog.query().where(
      'accessorUserId',
      actor!.user.userId
    )
    assert.equal(after.length, before.length)
  })
})
