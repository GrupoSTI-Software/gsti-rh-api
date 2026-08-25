import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
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
import {
  personUpdateBase,
  reloadBank,
  reloadPerson,
  RFC_ORIGINAL,
} from './sensitive_write_by_category_support.js'
import {
  assertMaskCorruptionRejected,
  assertMaskEchoAccepted,
  MASK_CORRUPT_A,
  MASK_ECHO_PHONE_SECONDARY,
  MASK_ECHO_RFC,
  MASK_EDITED_CARD,
} from './sensitive_mask_echo_support.js'

test.group('Eco de máscara HTTP — USRH1787433076990', (group) => {
  let actor: TenantActor
  let fixture: SensitiveFixture

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('mask-echo-http')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'mask-echo')
  })

  group.teardown(async () => {
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('F.1 CA-1: eco RFC sin lectura identificación pasa y no sobrescribe', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const person = fixture.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(
        personUpdateBase(person, { personRfc: MASK_ECHO_RFC, personSecondLastname: 'EcoQa' })
      )

    assertMaskEchoAccepted(response, assert)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    assert.equal(reloaded.personSecondLastname, 'EcoQa')
  })

  test('F.2 CA-2: eco teléfono secundario pasa', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const person = fixture.person
    const originalSecondary = person.personPhoneSecondary
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(
        personUpdateBase(person, {
          personPhoneSecondary: MASK_ECHO_PHONE_SECONDARY,
          personMaritalStatus: 'single',
        })
      )

    assertMaskEchoAccepted(response, assert)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personPhoneSecondary, originalSecondary)
  })

  test('F.3 CA-3: corrupción con máscara es 400/422', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personRfc: MASK_CORRUPT_A }))

    assertMaskCorruptionRejected(response, assert)
    const personAfterCorruption = await reloadPerson(fixture.person.personId)
    assert.equal(personAfterCorruption.personRfc, RFC_ORIGINAL)
  })

  test('F.4 CA-3: con lectura identificación el eco no se neutraliza', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write', 'sensitive-identificacion-read'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personRfc: MASK_ECHO_RFC }))

    assertMaskCorruptionRejected(response, assert)
  })

  test('F.5 CA-4: campo no catálogo con aspecto de máscara no se toca', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personFirstname: '••••' }))

    assert.equal(response.status(), 201)
    const personAfterMaskField = await reloadPerson(fixture.person.personId)
    assert.equal(personAfterMaskField.personFirstname, '••••')
  })

  test('F.6 CA-8: eco editado en tarjeta se descarta en silencio', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-bancos-write'])
    const bank = fixture.bank
    const cardOriginal = bank.employeeBankAccountCardNumber
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({
        employeeBankAccountClabe: bank.employeeBankAccountClabe,
        employeeBankAccountCurrencyType: bank.employeeBankAccountCurrencyType,
        employeeBankAccountCardNumber: MASK_EDITED_CARD,
      })

    assert.isTrue(response.status() === 200 || response.status() === 201)
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountCardNumber, cardOriginal)
  })
})
