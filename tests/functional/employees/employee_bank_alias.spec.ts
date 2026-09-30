import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import { updateEmployeeBankValidator } from '#validators/employee_bank'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import { reloadBank } from './sensitive_write_by_category_support.js'

/**
 * Alias de la cuenta bancaria: etiqueta libre que no es dato sensible, así que
 * se guarda, se conserva y se borra sin exigir el permiso financiero.
 */
test.group('Cuenta bancaria — alias', (group) => {
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
    actor = await createActor('bank-alias')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'bank-alias')
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

  test('el alias se guarda y se devuelve sin permiso financiero', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank

    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ employeeBankAccountClabe: null, employeeBankAccountCurrencyType: 'MXN', bankId: bank.bankId, employeeBankAlias: 'Cuenta de nómina' })

    assert.equal(response.status(), 200, JSON.stringify(response.body()))
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAlias, 'Cuenta de nómina')
  })

  test('sin enviar alias se conserva y con vacío se borra', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank
    const base = { employeeBankAccountClabe: null, employeeBankAccountCurrencyType: 'MXN', bankId: bank.bankId }
    const send = (body: Record<string, unknown>) =>
      client
        .put(`/api/employee-banks/${bank.employeeBankId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
        .json({ ...base, ...body })

    await send({ employeeBankAlias: 'Nómina' })
    const kept = await send({})
    assert.equal(kept.status(), 200, JSON.stringify(kept.body()))
    const afterKeep = await reloadBank(bank.employeeBankId)
    assert.equal(afterKeep.employeeBankAlias, 'Nómina')

    const cleared = await send({ employeeBankAlias: '' })
    assert.equal(cleared.status(), 200, JSON.stringify(cleared.body()))
    const afterClear = await reloadBank(bank.employeeBankId)
    assert.isNull(afterClear.employeeBankAlias)
  })

  test('el validador rechaza un alias de más de 40 caracteres', async ({ assert }) => {
    const base = { employeeBankAccountCurrencyType: 'MXN' }
    await updateEmployeeBankValidator.validate({ ...base, employeeBankAlias: 'x'.repeat(40) })
    let rejected = false
    try {
      await updateEmployeeBankValidator.validate({ ...base, employeeBankAlias: 'x'.repeat(41) })
    } catch {
      rejected = true
    }
    assert.isTrue(rejected)
  })
})
