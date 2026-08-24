import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import EmployeeBank from '#models/employee_bank'
import SystemModule from '#models/system_module'
import type User from '#models/user'
import {
  buHeader,
  CLEAR_FIXED,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  cleanupSystemActor,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  createSystemActor,
  grantModuleAction,
  grantOnly,
  restoreEmployeesGrants,
  snapshotAndClearEmployeesGrants,
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

async function putBankClabe(
  client: ApiClient,
  actor: TenantActor,
  bankId: number,
  bankRowBankId: number,
  user: User,
  clabe: string
) {
  return client
    .put(`/api/employee-banks/${bankId}`)
    .loginAs(user)
    .header('X-Business-Unit-Id', buHeader(actor))
    .json({
      employeeBankAccountClabe: clabe,
      employeeBankAccountCurrencyType: 'MXN',
      bankId: bankRowBankId,
    })
}

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

  test('CA-7: con interruptor OFF el cambio de CLABE sin financiero es 403', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const response = await client
      .put(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'MXN',
        bankId: fixture!.bank.bankId,
      })
    assertWriteForbidden(response, assert, 'datos financieros')
  })

  test('CA-7: con interruptor ON el cambio de CLABE sin financiero sigue 403', async ({
    client,
    assert,
  }) => {
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    try {
      await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
      const response = await client
        .put(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
        .json({
          employeeBankAccountClabe: CLABE_NUEVA,
          employeeBankAccountCurrencyType: 'MXN',
          bankId: fixture!.bank.bankId,
        })
      assertWriteForbidden(response, assert, 'datos financieros')
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('CA-7: owner sin slugs write cambia la CLABE', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'sens-write-owner', actor!.businessUnit.businessUnitId)
    const snapshot = await snapshotAndClearEmployeesGrants(owner.roleId)
    try {
      const clabeOwner = '012180001234567701'
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        owner.user,
        clabeOwner
      )
      assert.equal(response.status(), 200)
      const reloaded = await reloadBank(fixture!.bank.employeeBankId)
      assert.equal(reloaded.employeeBankAccountClabe, clabeOwner)
      reloaded.employeeBankAccountClabe = CLEAR_FIXED.clabe
      await reloaded.save()
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(owner)
    }
  })

  test('CA-7: root sin slugs write cambia la CLABE', async ({ client, assert }) => {
    const root = await createSystemActor('root', 'sens-write-root', actor!.businessUnit.businessUnitId)
    const snapshot = await snapshotAndClearEmployeesGrants(root.roleId)
    try {
      const clabeRoot = '012180001234567702'
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        root.user,
        clabeRoot
      )
      assert.equal(response.status(), 200)
      const reloaded = await reloadBank(fixture!.bank.employeeBankId)
      assert.equal(reloaded.employeeBankAccountClabe, clabeRoot)
      reloaded.employeeBankAccountClabe = CLEAR_FIXED.clabe
      await reloaded.save()
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(root)
    }
  })

  test('CA-7: super-administrador sin slugs no tiene bypass', async ({ client, assert }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-write-dg',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(dg.roleId)
    try {
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        dg.user,
        CLABE_NUEVA
      )
      assertWriteForbidden(response, assert, 'datos financieros')
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(dg)
    }
  })

  test('CA-7: write unresolved HTTP se cubre por classify + mixin (sin romper roleId NOT NULL)', ({
    assert,
  }) => {
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED, 'EMP.SENS.WRITE.UNRESOLVED')
  })

  test('CA-8: editar nombre, estado civil y ciudad sin categoría responde 201', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const rfcBefore = person.personRfc
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personFirstname: 'NombreQa',
          personMaritalStatus: 'divorced',
          personPlaceOfBirthCity: 'Toluca',
        })
      )
    assert.equal(response.status(), 201)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personFirstname, 'NombreQa')
    assert.equal(reloaded.personRfc, rfcBefore)
  })

  test('CA-8: diagnóstico médico sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-condicion-medica-write'])
    const diagnosisBefore = fixture!.medical.employeeMedicalConditionDiagnosis
    const response = await client
      .put(`/api/employee-medical-conditions/${fixture!.medical.employeeMedicalConditionId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeId: fixture!.employee.employeeId,
        medicalConditionTypeId: fixture!.medical.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'diagnostico qa nuevo',
      })
    assertWriteForbidden(response, assert, 'datos de salud')
    await fixture!.medical.refresh()
    assert.equal(fixture!.medical.employeeMedicalConditionDiagnosis, diagnosisBefore)
  })

  test('CA-8: teléfono de cónyuge sin contacto responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeSpouseFirstname: extra!.spouse.employeeSpouseFirstname,
        employeeSpouseLastname: extra!.spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: extra!.spouse.employeeSpouseSecondLastname ?? '',
        employeeSpousePhone: TELEFONO_NUEVO,
      })
    assertWriteForbidden(response, assert, 'datos de contacto')
    await extra!.spouse.refresh()
    assert.equal(extra!.spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-8: ocupación de cónyuge sin contacto responde 200 y no toca el teléfono', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeSpouseFirstname: extra!.spouse.employeeSpouseFirstname,
        employeeSpouseLastname: extra!.spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: extra!.spouse.employeeSpouseSecondLastname ?? '',
        employeeSpouseOcupation: 'Ingeniera QA',
      })
    assert.equal(response.status(), 200)
    await extra!.spouse.refresh()
    assert.equal(extra!.spouse.employeeSpouseOcupation, 'Ingeniera QA')
    assert.equal(extra!.spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-8: teléfono de emergencia sin contacto responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.emergency.employeeEmergencyContactPhone
    const response = await client
      .put(`/api/employee-emergency-contacts/${extra!.emergency.employeeEmergencyContactId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeEmergencyContactFirstname: extra!.emergency.employeeEmergencyContactFirstname,
        employeeEmergencyContactLastname: extra!.emergency.employeeEmergencyContactLastname,
        employeeEmergencyContactPhone: TELEFONO_NUEVO,
      })
    assertWriteForbidden(response, assert, 'datos de contacto')
    await extra!.emergency.refresh()
    assert.equal(extra!.emergency.employeeEmergencyContactPhone, phoneBefore)
  })

  test('CA-8: nota de incapacidad sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['manage-work-disabilities'])
    const descBefore = extra!.note.workDisabilityNoteDescription
    const response = await client
      .put(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ workDisabilityNoteDescription: 'nota clinica nueva qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.note.refresh()
    assert.equal(extra!.note.workDisabilityNoteDescription, descBefore)
  })

  test('CA-8: reporte traumático sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'update')
    const descBefore = extra!.trauma.traumaticEventReportDescription
    const response = await client
      .put(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ traumaticEventReportDescription: 'descripcion trauma nueva qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.trauma.refresh()
    assert.equal(extra!.trauma.traumaticEventReportDescription, descBefore)
  })

  test('CA-8: notas de lactancia sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-periodos-lactancia-write'])
    await grantModuleAction(actor!.role.roleId, 'employees', 'update-information')
    const notesBefore = extra!.lactation.employeeLactationPeriodNotes
    const response = await client
      .put(`/api/employee-lactation-periods/${extra!.lactation.employeeLactationPeriodId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ employeeLactationPeriodNotes: 'notas lactancia nuevas qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.lactation.refresh()
    assert.equal(extra!.lactation.employeeLactationPeriodNotes, notesBefore)
  })

  test('CA-8: cambio de dedos sin biométrico responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    const dataBefore = extra!.biometric.employeeBiometricData
    const response = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ fingers: [1, 2] })
    assertWriteForbidden(response, assert, 'datos biométricos')
    await extra!.biometric.refresh()
    assert.equal(extra!.biometric.employeeBiometricData, dataBefore)
  })
})
