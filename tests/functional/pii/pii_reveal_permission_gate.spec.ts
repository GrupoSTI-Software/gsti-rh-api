import { test } from '@japa/runner'
import {
  createActor,
  cleanupActor,
  createSensitiveFixture,
  cleanupSensitiveFixture,
  buHeader,
  createSystemActor,
  cleanupSystemActor,
  grantAcrossModules,
  countRevealLogs,
  cleanupRevealLogs,
  type TenantActor,
  type SensitiveFixture,
} from './pii_permission_gate_support.js'

const REVEALABLE_COLUMNS = [
  { model: 'Person', column: 'personCurp', permission: 'sensitive-identificacion-read', clearKey: 'curp' as const },
  { model: 'Person', column: 'personRfc', permission: 'sensitive-identificacion-read', clearKey: 'rfc' as const },
  { model: 'Person', column: 'personImssNss', permission: 'sensitive-identificacion-read', clearKey: 'nss' as const },
  { model: 'Person', column: 'personEmail', permission: 'sensitive-contacto-read', clearKey: 'email' as const },
  { model: 'Person', column: 'personPhone', permission: 'sensitive-contacto-read', clearKey: 'phone' as const },
  { model: 'Person', column: 'personPhoneSecondary', permission: 'sensitive-contacto-read', clearKey: 'phoneSecondary' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountClabe', permission: 'sensitive-financiero-read', clearKey: 'clabe' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountNumber', permission: 'sensitive-financiero-read', clearKey: 'account' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountCardNumber', permission: 'sensitive-financiero-read', clearKey: 'card' as const },
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionDiagnosis', permission: 'sensitive-salud-read', clearKey: 'diagnosis' as const },
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionNotes', permission: 'sensitive-salud-read', clearKey: 'notes' as const },
] as const

function recordIdFor(model: string, fixture: SensitiveFixture): number {
  if (model === 'Person') return fixture.person.personId
  if (model === 'EmployeeBank') return fixture.bank.employeeBankId
  if (model === 'EmployeeMedicalCondition') return fixture.medical.employeeMedicalConditionId
  throw new Error(`Modelo sin recordId mapeado en esta suite: ${model}`)
}

test.group('Permiso de categoría en el revelado individual (USRH1787433076989)', (group) => {
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-reveal-gate')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'pii-reveal-gate')
  })

  group.each.teardown(async () => {
    if (actor) {
      await cleanupRevealLogs({ userId: actor.user.userId })
      await cleanupRevealLogs({ businessUnitId: actor.businessUnit.businessUnitId })
    }
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    fixture = null
    actor = null
  })

  test('F.1 — revela CURP con el permiso de identificación y escribe un asiento', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.person.personId
    const before = await countRevealLogs('Person', 'personCurp', recordId)

    const response = await client
      .get(`/api/v1/pii/reveal/Person/personCurp/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(200)
    assert.equal(response.body().data.personCurp, fixture!.clear.curp)
    const after = await countRevealLogs('Person', 'personCurp', recordId)
    assert.equal(after, before + 1)
  })

  test('F.2 — las once columnas revelables devuelven 200 con su categoría y registran un asiento cada una', async ({ client, assert }) => {
    for (const { model, column, permission, clearKey } of REVEALABLE_COLUMNS) {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: [permission] },
      ])
      const recordId = recordIdFor(model, fixture!)
      const before = await countRevealLogs(model, column, recordId)

      const response = await client
        .get(`/api/v1/pii/reveal/${model}/${column}/${recordId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))

      assert.equal(response.status(), 200, `${model}.${column} debió responder 200`)
      assert.equal(
        response.body().data[column],
        fixture!.clear[clearKey],
        `${model}.${column} no devolvió el claro esperado`
      )
      const after = await countRevealLogs(model, column, recordId)
      assert.equal(after, before + 1, `${model}.${column} no registró exactamente un asiento nuevo`)
    }
  })

  test('F.3 — sin sensitive-salud-read, el diagnóstico responde 403 sin escribir asiento', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.medical.employeeMedicalConditionId
    const before = await countRevealLogs(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis',
      recordId
    )

    const response = await client
      .get(`/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(body.key, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(body.detail, 'datos de salud')
    assert.notInclude(JSON.stringify(body), fixture!.clear.diagnosis)
    const after = await countRevealLogs(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis',
      recordId
    )
    assert.equal(after, before)
  })

  test('F.4 — sin sensitive-financiero-read, la CLABE revelada da 403 y la CLABE de ficha sigue tapada', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.bank.employeeBankId

    const revealResponse = await client
      .get(`/api/v1/pii/reveal/EmployeeBank/employeeBankAccountClabe/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    revealResponse.assertStatus(403)
    assert.equal(revealResponse.body().code, 'EMP.SENS.READ.FORBIDDEN')

    const bankResponse = await client
      .get(`/api/employee-banks/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    bankResponse.assertStatus(200)
    const clabe = bankResponse.body().data.employeeBank.employeeBankAccountClabe
    assert.notEqual(clabe, fixture!.clear.clabe)
  })

  test('F.5 — el permiso de categoría no expande el alcance de empresa: 404, nunca 403', async ({ client, assert }) => {
    const otherActor = await createActor('pii-reveal-gate-other-bu')
    const otherFixture = await createSensitiveFixture(
      otherActor.businessUnit.businessUnitId,
      'pii-reveal-gate-other-bu'
    )
    try {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: ['sensitive-identificacion-read'] },
      ])
      const response = await client
        .get(`/api/v1/pii/reveal/Person/personCurp/${otherFixture.person.personId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(404)
    } finally {
      await cleanupSensitiveFixture(otherFixture)
      await cleanupActor(otherActor)
    }
  })

  test('F.6 — una columna no clasificada da 422 sin importar los permisos del actor', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get(`/api/v1/pii/reveal/Person/personFirstname/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(422)
    assert.equal(response.body().code, 'EMP.SENS.READ.NOT_CLASSIFIED')
  })

  test('F.7 — root y owner leen en claro sin ningún slug de categoría (bypass standard)', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'pii-reveal-gate-owner', actor!.businessUnit.businessUnitId)
    try {
      const response = await client
        .get(`/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/${fixture!.medical.employeeMedicalConditionId}`)
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
      assert.equal(
        response.body().data.employeeMedicalConditionDiagnosis,
        fixture!.clear.diagnosis
      )
    } finally {
      await cleanupRevealLogs({ userId: owner.user.userId })
      await cleanupSystemActor(owner)
    }
  })
})
