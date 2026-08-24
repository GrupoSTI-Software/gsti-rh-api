import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  grantOnly,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  assertWriteForbidden,
  CURP_NUEVA,
  MASK_ECHO,
  personUpdateBase,
  reloadPerson,
  RFC_NUEVO,
  RFC_ORIGINAL,
  TELEFONO_NUEVO,
} from './sensitive_write_by_category_support.js'

test.group('Escritura sensible por categoría — HTTP', (group) => {
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
    actor = await createActor('sens-write-http')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-write')
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

  test('CA-1: PUT persona con RFC null y cambio de apellido no exige categoría', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personRfc: null,
          personSecondLastname: 'ApellidoQa',
          personMaritalStatus: 'married',
        })
      )

    assert.equal(response.status(), 201)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    assert.equal(reloaded.personSecondLastname, 'ApellidoQa')
    assert.equal(reloaded.personMaritalStatus, 'married')
  })

  test('CA-1: eco de máscara en RFC es 400/422, nunca 403 de escritura', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(personUpdateBase(person, { personRfc: MASK_ECHO }))

    assert.isTrue(response.status() === 400 || response.status() === 422)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })

  test('CA-2: RFC distinto sin identificación responde 403 y no guarda', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(personUpdateBase(person, { personRfc: RFC_NUEVO }))

    assertWriteForbidden(response, assert, 'datos de identificación')
    assert.notInclude(JSON.stringify(response.body()), RFC_NUEVO)
    assert.notInclude(JSON.stringify(response.body()), RFC_ORIGINAL)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })

  test('CA-3: teléfono nuevo más CURP nueva sin identificación no guarda el teléfono', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write', 'sensitive-contacto-write'])
    const person = fixture!.person
    const phoneBefore = person.personPhone
    const curpBefore = person.personCurp
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personPhone: TELEFONO_NUEVO,
          personCurp: CURP_NUEVA,
        })
      )

    assertWriteForbidden(response, assert, 'datos de identificación')
    assert.notInclude(JSON.stringify(response.body()), TELEFONO_NUEVO)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personPhone, phoneBefore)
    assert.equal(reloaded.personCurp, curpBefore)
  })
})
