import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import SystemModule from '#models/system_module'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  bearerGet,
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  emergencyBody,
  emergencyPhonesFromEmployeeList,
  empresaRfcFromIndex,
  expectAmountNull,
  expectMaskedHealth,
  expectNeverDenied,
  expectNoClearRemaining,
  firstSalaryDaily,
  grantOnly,
  lactationNotesFromIndex,
  loginWeb,
  medicalConditionBody,
  prepareSensitiveJourney,
  rangeAmounts,
  spouseBody,
  traumaFromIndex,
  traumaFromShow,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function sessionToken(
  client: ApiClient,
  actor: TenantActor,
  assert: Assert
) {
  const login = await loginWeb(client, actor.user.userEmail, TEST_PASSWORD)
  expectNeverDenied(login, assert)
  return bearerFromLogin(login.body())
}

async function openAnexoASurfaces(
  client: ApiClient,
  token: string,
  actor: TenantActor,
  fixture: SensitiveFixture,
  extra: RemainingSensitiveFixture
) {
  const headerActor = actor
  const noteRes = await bearerGet(
    client,
    `/api/work-disability-notes/${extra.note.workDisabilityNoteId}`,
    token,
    headerActor
  )
  const spouseRes = await bearerGet(
    client,
    `/api/employee-spouses/${extra.spouse.employeeSpouseId}`,
    token,
    headerActor
  )
  const emergencyRes = await bearerGet(
    client,
    `/api/employee-emergency-contacts/${extra.emergency.employeeEmergencyContactId}`,
    token,
    headerActor
  )
  const emergencyListRes = await bearerGet(
    client,
    `/api/employee-emergency-contacts/employee/${fixture.employee.employeeId}`,
    token,
    headerActor
  )
  const lactationRes = await bearerGet(
    client,
    '/api/employee-lactation-periods',
    token,
    headerActor,
    { employeeId: fixture.employee.employeeId, page: 1, limit: 10 }
  )
  const traumaShowRes = await bearerGet(
    client,
    `/api/traumatic-event-reports/${extra.trauma.traumaticEventReportId}`,
    token,
    headerActor
  )
  const traumaIndexRes = await bearerGet(
    client,
    '/api/traumatic-event-reports',
    token,
    headerActor,
    { page: 1, limit: 10, employeeId: fixture.employee.employeeId }
  )
  const salaryRes = await bearerGet(
    client,
    `/api/employees/${fixture.employee.employeeId}/salary-history`,
    token,
    headerActor
  )
  const rangeRes = await bearerGet(
    client,
    '/api/position-salary-ranges',
    token,
    headerActor,
    {
      razon_social_id: actor.businessUnit.businessUnitId,
      position_id: fixture.positionId,
    }
  )
  const biometricRes = await bearerGet(
    client,
    `/api/employees/${fixture.employee.employeeId}/biometrics`,
    token,
    headerActor
  )
  const empresaIndexRes = await bearerGet(
    client,
    '/api/empresas-contratantes',
    token,
    headerActor,
    { page: 1, perPage: 20 }
  )
  const medicalRes = await bearerGet(
    client,
    `/api/employee-medical-conditions/${fixture.medical.employeeMedicalConditionId}`,
    token,
    headerActor
  )
  return {
    noteRes,
    spouseRes,
    emergencyRes,
    emergencyListRes,
    lactationRes,
    traumaShowRes,
    traumaIndexRes,
    salaryRes,
    rangeRes,
    biometricRes,
    empresaIndexRes,
    medicalRes,
  }
}

test.group('Lectura sensible — 15 columnas restantes — E2E Japa', (group) => {
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
    actor = await createActor('sens15-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e15')
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

  test('humo: login web y GET nota de incapacidad con Bearer responde 200', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const response = await bearerGet(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    )
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })

  test('R.1: RH sin lecturas sensibles recorre el expediente y todo va tapado o null', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const surfaces = await openAnexoASurfaces(client, token, actor!, fixture!, extra!)
    for (const response of Object.values(surfaces)) {
      expectNeverDenied(response, assert)
    }

    expectMaskedHealth(
      workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
      assert
    )
    expectMaskedHealth(
      medicalConditionBody(surfaces.medicalRes.body()).employeeMedicalConditionDiagnosis,
      assert
    )
    expectMaskedHealth(
      lactationNotesFromIndex(
        surfaces.lactationRes.body(),
        extra!.lactation.employeeLactationPeriodId
      ),
      assert
    )
    expectMaskedHealth(
      traumaFromShow(surfaces.traumaShowRes.body()).traumaticEventReportInvolvedPeople,
      assert
    )
    expectMaskedHealth(
      traumaFromIndex(
        surfaces.traumaIndexRes.body(),
        extra!.trauma.traumaticEventReportId
      ).traumaticEventReportDescription,
      assert
    )

    assert.equal(
      spouseBody(surfaces.spouseRes.body()).employeeSpousePhone,
      maskSensitiveValue(CLEAR_FIXED.phoneSecondary, 'contacto')
    )
    assert.equal(
      emergencyBody(surfaces.emergencyRes.body()).employeeEmergencyContactPhone,
      maskSensitiveValue(CLEAR_FIXED.phone, 'contacto')
    )
    assert.equal(
      emergencyPhonesFromEmployeeList(
        surfaces.emergencyListRes.body(),
        extra!.emergency.employeeEmergencyContactId
      ),
      maskSensitiveValue(CLEAR_FIXED.phone, 'contacto')
    )

    expectAmountNull(firstSalaryDaily(surfaces.salaryRes.body()), assert)
    const amounts = rangeAmounts(surfaces.rangeRes.body())
    expectAmountNull(amounts.min, assert)
    expectAmountNull(amounts.max, assert)

    assert.equal(
      empresaRfcFromIndex(
        surfaces.empresaIndexRes.body(),
        extra!.empresa.empresaContratanteId
      ),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )

    const biometric = surfaces.biometricRes.body()?.data?.employeeBiometric as Record<
      string,
      unknown
    >
    assert.include(biometric.fingers as number[], 1)
    assert.include(biometric.fingers as number[], 4)
    assert.isTrue(Boolean(biometric.face))
    assert.isUndefined(biometric.employeeBiometricData)
    assert.notInclude(JSON.stringify(surfaces.biometricRes.body()), CLEAR_REMAINING.biometricData)
  })
})
