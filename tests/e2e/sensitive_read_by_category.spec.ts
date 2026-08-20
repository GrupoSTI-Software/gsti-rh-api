import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  cleanupSystemActor,
  createActor,
  createSensitiveFixture,
  createSystemActor,
  employeeBankBody,
  employeePerson,
  expectBankClear,
  expectBankMasked,
  expectElevenClear,
  expectMedicalMasked,
  expectNeverDenied,
  expectPersonContactoMasked,
  expectPersonIdentificacionClear,
  expectPersonIdentificacionMasked,
  grantAdditionally,
  grantOnly,
  loginUserPerson,
  loginWeb,
  medicalConditionBody,
  permissionId,
  revokeSlugs,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

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

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

test.group('Lectura sensible por categoría — E2E Japa', (group) => {
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
    actor = await createActor('sens-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e')
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

  test('humo: POST /api/auth/login con cuenta activada responde 200 y token string', async ({
    client,
    assert,
  }) => {
    const response = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    assert.equal(response.status(), 200)
    const token = bearerFromLogin(response.body())
    assert.isAbove(token.length, 10)
  })

  test('E.1 CA-6: POST /api/auth/login tapa el correo del actor aunque tenga contacto', async ({
    client,
    assert,
  }) => {
    const originalPersonEmail = actor!.person.personEmail
    const originalUserEmail = actor!.user.userEmail
    const actorEmail = `e2e-login-${Date.now()}@empresa.com`
    try {
      actor!.person.personEmail = actorEmail
      actor!.person.personPhone = fixture!.clear.phone
      await actor!.person.save()
      actor!.user.userEmail = actorEmail
      await actor!.user.save()
      await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
      const response = await loginWeb(client, actorEmail, TEST_PASSWORD)
      expectNeverDenied(response, assert)
      const person = loginUserPerson(response.body())
      assert.equal(person.personEmail, maskSensitiveValue(actorEmail, 'contacto'))
      assert.equal(person.personPhone, maskSensitiveValue(fixture!.clear.phone, 'contacto'))
      assert.notEqual(person.personEmail, actorEmail)
    } finally {
      actor!.person.personEmail = originalPersonEmail
      await actor!.person.save()
      actor!.user.userEmail = originalUserEmail
      await actor!.user.save()
    }
  })

  test('E.2: ficha con Bearer del login y contacto destapa email del colaborador', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const login = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    expectNeverDenied(login, assert)
    const token = bearerFromLogin(login.body())
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .header('Authorization', `Bearer ${token}`)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personEmail, fixture!.clear.email)
    assert.equal(
      person.personCurp,
      maskSensitiveValue(fixture!.clear.curp, 'identificacion')
    )
  })

  test('E.3: solo sensitive-identificacion-read destapa CURP/RFC/NSS; contacto y bancos tapados', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-identificacion-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectPersonIdentificacionClear(person, fixture!.clear, assert)
    expectPersonContactoMasked(person, fixture!.clear, assert)
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
  })

  test('E.4: solo sensitive-financiero-read destapa CLABE/cuenta/tarjeta; persona tapada', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(bankRes, assert)
    expectBankClear(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectPersonContactoMasked(employeePerson(employeeRes.body()), fixture!.clear, assert)
    expectPersonIdentificacionMasked(
      employeePerson(employeeRes.body()),
      fixture!.clear,
      assert
    )
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
  })

  test('E.5: las cinco lecturas entregan las 11 en claro', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [...FIVE_READS])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
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
  })

  test('E.6: super-administrador con las cinco lecturas recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-e2e-dg',
      actor!.businessUnit.businessUnitId
    )
    const alreadyGranted = new Set<string>()
    for (const slug of FIVE_READS) {
      const existing = await RoleSystemPermission.query()
        .where('role_id', dg.roleId)
        .where('system_permission_id', await permissionId(slug))
        .first()
      if (existing) alreadyGranted.add(slug)
    }
    await grantAdditionally(dg.roleId, [...FIVE_READS])
    const addedSlugs = FIVE_READS.filter((slug) => !alreadyGranted.has(slug))
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: dg.user },
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
      if (addedSlugs.length > 0) {
        await revokeSlugs(dg.roleId, addedSlugs)
      }
      await cleanupSystemActor(dg)
    }
  })
})
