import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import SystemModule from '#models/system_module'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import { SensitiveAccessContext, type SensitiveWriteDecision } from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'
import EmployeeBiometricService from '#services/employee_biometric_service'
import {
  allDenied,
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  empresaRfcFromShow,
  expectAmountMasked,
  expectMaskedHealth,
  expectNeverDenied,
  firstSalaryDaily,
  grantModuleAction,
  grantOnly,
  medicalConditionBody,
  rangeAmounts,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

function fakeI18n(): I18n {
  return { formatMessage: (key: string) => key } as I18n
}

test.group('Lectura sensible — 15 columnas restantes — HTTP', (group) => {
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
    actor = await createActor('sens-read-15')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens15')
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

  test('humo: GET nota de incapacidad sin grants sensibles responde 200', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })

  test('CA-3: sin financiero los importes van enmascarados, nunca mascara parcial', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    // El catálogo vigente declara `positions` con exigencia encendida
    // (system_modules.constant.ts): leer rangos pide su propio permiso, aparte
    // de la categoría sensible que prueba este caso.
    await grantModuleAction(actor!.role.roleId, 'positions', 'salary-ranges-read')
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    expectAmountMasked(firstSalaryDaily(salaryRes.body()), assert)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(rangeRes, assert)
    const amounts = rangeAmounts(rangeRes.body())
    expectAmountMasked(amounts.min, assert)
    expectAmountMasked(amounts.max, assert)
  })

  test('CA-3: con sensitive-financiero-read los importes siguen enmascarados en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    // Misma razón que el caso anterior: `positions` exige su permiso de lectura de rangos.
    await grantModuleAction(actor!.role.roleId, 'positions', 'salary-ranges-read')
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(salaryRes, assert)
    expectAmountMasked(firstSalaryDaily(salaryRes.body()), assert)

    const rangeRes = await client
      .get('/api/position-salary-ranges')
      .qs({
        razon_social_id: actor!.businessUnit.businessUnitId,
        position_id: fixture!.positionId,
      })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const amounts = rangeAmounts(rangeRes.body())
    expectAmountMasked(amounts.min, assert)
    expectAmountMasked(amounts.max, assert)
  })

  test('CA-2: RFC de empresa contratante se enmascara sin identificacion', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(
      empresaRfcFromShow(response.body()),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc)
    )
  })

  test('CA-2: RFC de empresa contratante sigue enmascarado con identificacion en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-identificacion-read'])
    await grantModuleAction(actor!.role.roleId, 'repse-registrations', 'read')
    const response = await client
      .get(`/api/empresas-contratantes/${extra!.empresa.empresaContratanteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    assert.equal(
      empresaRfcFromShow(response.body()),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc)
    )
  })

  test('CA-4: solo sensitive-salud-read deja las 6 de salud tapadas en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-salud-read', 'read'])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'read')
    const medicalRes = await client
      .get(
        `/api/employee-medical-conditions/${fixture!.medical.employeeMedicalConditionId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(medicalRes, assert)
    const medical = medicalConditionBody(medicalRes.body())
    expectMaskedHealth(medical.employeeMedicalConditionDiagnosis, assert)
    expectMaskedHealth(medical.employeeMedicalConditionNotes, assert)

    const noteRes = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectMaskedHealth(
      workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription,
      assert
    )

    const lactationRes = await client
      .get('/api/employee-lactation-periods')
      .qs({ employeeId: fixture!.employee.employeeId, page: 1, limit: 10 })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(lactationRes, assert)
    const lactationRows =
      (lactationRes.body()?.data?.employeeLactationPeriods?.data as Record<string, unknown>[]) ??
      []
    const lactationRow = lactationRows.find(
      (row) => row.employeeLactationPeriodId === extra!.lactation.employeeLactationPeriodId
    )
    assert.exists(lactationRow)
    expectMaskedHealth(lactationRow!.employeeLactationPeriodNotes, assert)

    const traumaRes = await client
      .get(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(traumaRes, assert)
    const trauma = traumaRes.body()?.data?.traumaticEventReport as Record<string, unknown>
    expectMaskedHealth(trauma.traumaticEventReportInvolvedPeople, assert)
    expectMaskedHealth(trauma.traumaticEventReportDescription, assert)
  })

  test('CA-4: sin salud las 4 columnas nuevas van tapadas', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['read'])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'read')
    const noteRes = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectMaskedHealth(
      workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription,
      assert
    )
    const traumaRes = await client
      .get(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    const trauma = traumaRes.body()?.data?.traumaticEventReport as Record<string, unknown>
    expectMaskedHealth(trauma.traumaticEventReportInvolvedPeople, assert)
    expectMaskedHealth(trauma.traumaticEventReportDescription, assert)
  })

  test('CA-1: GET biometrics muestra conteo y no el string Finger', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/biometrics`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const biometric = response.body()?.data?.employeeBiometric as Record<string, unknown>
    assert.isArray(biometric.fingers)
    assert.include(biometric.fingers as number[], 1)
    assert.include(biometric.fingers as number[], 4)
    assert.isTrue(Boolean(biometric.face))
    assert.isUndefined(biometric.employeeBiometricData)
    assert.notInclude(JSON.stringify(response.body()), CLEAR_REMAINING.biometricData)
  })

  test('CA-2: getEnrollmentStatus siempre tapa biometricData aunque haya permiso biométrico', async ({
    assert,
  }) => {
    const service = new EmployeeBiometricService(fakeI18n())
    const masked = await service.getEnrollmentStatus(fixture!.employee.employeeId)
    assert.exists(masked)
    assert.equal(masked!.biometricData, MASK_CHAR.repeat(5))
    assert.include(masked!.fingers, 1)
    assert.isTrue(masked!.face)

    const stillMasked = await SensitiveAccessContext.run(
      {
        read: { ...allDenied, biometrico: true },
        write: deniedWrite,
      },
      () => service.getEnrollmentStatus(fixture!.employee.employeeId)
    )
    assert.equal(stillMasked!.biometricData, MASK_CHAR.repeat(5))
  })

  test('CA-1: serialize de FaceId tapa token y photoUrl aunque haya permiso biométrico', async ({
    assert,
  }) => {
    await extra!.faceId.refresh()
    const masked = extra!.faceId.serialize()
    assert.equal(masked.employeeBiometricFaceIdToken, MASK_CHAR.repeat(5))
    assert.equal(masked.employeeBiometricFaceIdPhotoUrl, MASK_CHAR.repeat(5))
    const stillMasked = SensitiveAccessContext.run(
      {
        read: { ...allDenied, biometrico: true },
        write: deniedWrite,
      },
      () => extra!.faceId.serialize()
    )
    assert.equal(stillMasked.employeeBiometricFaceIdToken, MASK_CHAR.repeat(5))
    assert.equal(stillMasked.employeeBiometricFaceIdPhotoUrl, MASK_CHAR.repeat(5))
  })

  test('UserConsent.serialize tapa IP y UA aunque haya permiso de contacto', async ({
    assert,
  }) => {
    if (!extra!.consent) {
      assert.isTrue(true)
      return
    }
    await extra!.consent.refresh()
    const masked = extra!.consent.serialize()
    assert.equal(
      masked.userConsentIp,
      maskSensitiveValue(CLEAR_REMAINING.consentIp)
    )
    assert.equal(
      masked.userConsentUserAgent,
      maskSensitiveValue(CLEAR_REMAINING.consentUa)
    )
    const stillMasked = SensitiveAccessContext.run(
      {
        read: { ...allDenied, contacto: true },
        write: deniedWrite,
      },
      () => extra!.consent!.serialize()
    )
    assert.equal(
      stillMasked.userConsentIp,
      maskSensitiveValue(CLEAR_REMAINING.consentIp)
    )
    assert.equal(
      stillMasked.userConsentUserAgent,
      maskSensitiveValue(CLEAR_REMAINING.consentUa)
    )
  })
})
