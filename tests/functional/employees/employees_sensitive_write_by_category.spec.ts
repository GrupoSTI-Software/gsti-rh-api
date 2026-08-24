import { test } from '@japa/runner'
import EmployeeBank from '#models/employee_bank'
import SystemModule from '#models/system_module'
import {
  buHeader,
  CLEAR_FIXED,
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
  CLABE_NUEVA,
  CURP_NUEVA,
  MASK_ECHO,
  personUpdateBase,
  reloadBank,
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

  test('CA-4: CLABE distinta sin financiero responde 403 y no cambia', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'USD',
        bankId: bank.bankId,
      })

    assertWriteForbidden(response, assert, 'datos financieros')
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountClabe, CLEAR_FIXED.clabe)
  })

  test('CA-4: CLABE null más cambio de moneda no exige financiero', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank
    const currencyBefore = bank.employeeBankAccountCurrencyType
    const newCurrency = currencyBefore === 'MXN' ? 'USD' : 'MXN'
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: null,
        employeeBankAccountCurrencyType: newCurrency,
        bankId: bank.bankId,
      })

    assert.equal(response.status(), 200)
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountClabe, CLEAR_FIXED.clabe)
    assert.equal(reloaded.employeeBankAccountCurrencyType, newCurrency)
  })

  test('CA-5: POST banco con CLABE sin financiero no crea fila', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const before = await EmployeeBank.query().where('employee_id', fixture!.employee.employeeId)
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture!.employee.employeeId,
        bankId: 1,
      })

    assertWriteForbidden(response, assert, 'datos financieros')
    const after = await EmployeeBank.query().where('employee_id', fixture!.employee.employeeId)
    assert.equal(after.length, before.length)
  })

  test('CA-5: POST banco con financiero crea la fila', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write', 'sensitive-financiero-write'])
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: '012180001234567888',
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture!.employee.employeeId,
        bankId: 1,
      })

    assert.equal(response.status(), 201)
    const createdId = Number(response.body()?.data?.employeeBank?.employeeBankId)
    assert.isAbove(createdId, 0)
    const created = await reloadBank(createdId)
    assert.equal(created.employeeBankAccountClabe, '012180001234567888')
    await created.delete()
  })

  test('CA-6: GET foto con token distinto sin biométrico-write responde 200 y renueva', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    const tokenNuevo = `face-token-ca6-${Date.now()}`
    const response = await client
      .get(
        `/api/employees/${fixture!.employee.employeeId}/biometric-face-id-with-token/${tokenNuevo}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    await extra!.faceId.refresh()
    assert.equal(extra!.faceId.employeeBiometricFaceIdToken, tokenNuevo)
  })
})
