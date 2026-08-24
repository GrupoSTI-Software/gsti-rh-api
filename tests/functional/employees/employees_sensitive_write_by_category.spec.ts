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
  personUpdateBase,
  reloadPerson,
  RFC_ORIGINAL,
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
})
