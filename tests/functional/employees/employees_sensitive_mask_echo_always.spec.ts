import { test } from '@japa/runner'
import EmpresaContratante from '#models/empresa_contratante'
import SystemModule from '#models/system_module'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  cleanupSystemActor,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  createSystemActor,
  grantModuleAction,
  grantOnly,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type SystemActor,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  personUpdateBase,
  reloadPerson,
  RFC_ORIGINAL,
} from './sensitive_write_by_category_support.js'
import {
  assertMaskEchoAccepted,
  MASK_ECHO_LEGACY_RFC,
  MASK_ECHO_RFC,
} from './sensitive_mask_echo_support.js'

const LEGACY_SPOUSE_PHONE_ECHO = `••••${CLEAR_FIXED.phoneSecondary.slice(-4)}`

test.group('Eco de máscara siempre — USRH1789477675771', (group) => {
  let actor: TenantActor
  let fixture: SensitiveFixture
  let extra: RemainingSensitiveFixture
  let owner: SystemActor | null = null

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actor = await createActor('mask-echo-always')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'mask-echo-always')
    extra = await createRemainingSensitiveFixture(actor, fixture)
    owner = await createSystemActor(
      'owner',
      'mask-echo-always-owner',
      actor.businessUnit.businessUnitId
    )
  })

  group.teardown(async () => {
    await cleanupSystemActor(owner)
    await cleanupRemainingSensitiveFixture(extra)
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('CA-2: eco teléfono cónyuge con lectura contacto se neutraliza', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write', 'sensitive-contacto-read'])
    const spouse = extra.spouse
    const phoneBefore = spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${spouse.employeeSpouseId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({
        employeeSpouseFirstname: 'NombreEco',
        employeeSpouseLastname: spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: spouse.employeeSpouseSecondLastname ?? '',
        employeeSpousePhone: SENSITIVE_MASK,
      })

    assertMaskEchoAccepted(response, assert, 200)
    await spouse.refresh()
    assert.equal(spouse.employeeSpouseFirstname, 'NombreEco')
    assert.equal(spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-2: forma heredada de teléfono cónyuge se neutraliza', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write', 'sensitive-contacto-read'])
    const spouse = extra.spouse
    const phoneBefore = spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${spouse.employeeSpouseId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({
        employeeSpouseFirstname: 'NombreEcoLegacy',
        employeeSpouseLastname: spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: spouse.employeeSpouseSecondLastname ?? '',
        employeeSpousePhone: LEGACY_SPOUSE_PHONE_ECHO,
      })

    assertMaskEchoAccepted(response, assert, 200)
    await spouse.refresh()
    assert.equal(spouse.employeeSpouseFirstname, 'NombreEcoLegacy')
    assert.equal(spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-3: owner repite eco RFC sin rechazar', async ({ client, assert }) => {
    const person = fixture.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(owner!.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(
        personUpdateBase(person, { personRfc: MASK_ECHO_RFC, personSecondLastname: 'EcoOwner' })
      )

    assertMaskEchoAccepted(response, assert)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    assert.equal(reloaded.personSecondLastname, 'EcoOwner')
  })

  test('CA-4: PATCH empresa contratante sin identificacion neutraliza RFC tapado', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, [])
    await grantModuleAction(actor.role.roleId, 'repse-registrations', 'update')
    const empresa = extra.empresa
    const response = await client
      .patch(`/api/empresas-contratantes/${empresa.empresaContratanteId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({ razonSocial: 'Nueva Razon Social QA', rfc: SENSITIVE_MASK })

    assertMaskEchoAccepted(response, assert, 200)
    const reloaded = await EmpresaContratante.findOrFail(empresa.empresaContratanteId)
    assert.equal(reloaded.razonSocial, 'Nueva Razon Social QA')
    assert.equal(reloaded.rfc, CLEAR_REMAINING.empresaRfc)
  })

  test('CA-4: PATCH empresa contratante con identificacion neutraliza RFC tapado', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['sensitive-identificacion-read'])
    await grantModuleAction(actor.role.roleId, 'repse-registrations', 'update')
    const empresa = extra.empresa
    const response = await client
      .patch(`/api/empresas-contratantes/${empresa.empresaContratanteId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({ razonSocial: 'Nueva Razon Con Read QA', rfc: MASK_ECHO_LEGACY_RFC })

    assertMaskEchoAccepted(response, assert, 200)
    const reloaded = await EmpresaContratante.findOrFail(empresa.empresaContratanteId)
    assert.equal(reloaded.razonSocial, 'Nueva Razon Con Read QA')
    assert.equal(reloaded.rfc, CLEAR_REMAINING.empresaRfc)
  })
})
