import { test } from '@japa/runner'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { LEGAL_CATEGORIES, SENSITIVE_FIELDS } from '#constants/sensitive_fields'

test.group('SensitiveFieldsCatalogService.categoryOf', () => {
  test('devuelve la categoría del catálogo para las 11 columnas maskedInApi', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('Person', 'personCurp'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personRfc'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personImssNss'), 'identificacion')
    assert.equal(catalog.categoryOf('Person', 'personEmail'), 'contacto')
    assert.equal(catalog.categoryOf('Person', 'personPhone'), 'contacto')
    assert.equal(catalog.categoryOf('Person', 'personPhoneSecondary'), 'contacto')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountClabe'), 'financiero')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountNumber'), 'financiero')
    assert.equal(catalog.categoryOf('EmployeeBank', 'employeeBankAccountCardNumber'), 'financiero')
    assert.equal(
      catalog.categoryOf('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeMedicalCondition', 'employeeMedicalConditionNotes'),
      'salud'
    )
  })

  test('Employee.dailySalary está clasificado como financiero (USRH1787433076994)', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('Employee', 'dailySalary'), 'financiero')
  })

  test('devuelve null si el par modelo/columna no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.isNull(catalog.categoryOf('Person', 'personFirstname'))
    assert.isNull(catalog.categoryOf('Employee', 'employeeCode'))
  })
})

test.group('SensitiveFieldsCatalogService.categoryOf — Anexo A orden 31', () => {
  test('resuelve las 15 columnas restantes', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('EmployeeBiometric', 'employeeBiometricData'), 'biometrico')
    assert.equal(
      catalog.categoryOf('EmployeeBiometricFaceId', 'employeeBiometricFaceIdToken'),
      'biometrico'
    )
    assert.equal(
      catalog.categoryOf('EmployeeBiometricFaceId', 'employeeBiometricFaceIdPhotoUrl'),
      'biometrico'
    )
    assert.equal(
      catalog.categoryOf('WorkDisabilityNote', 'workDisabilityNoteDescription'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('TraumaticEventReport', 'traumaticEventReportInvolvedPeople'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('TraumaticEventReport', 'traumaticEventReportDescription'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeLactationPeriod', 'employeeLactationPeriodNotes'),
      'salud'
    )
    assert.equal(
      catalog.categoryOf('EmployeeEmergencyContact', 'employeeEmergencyContactPhone'),
      'contacto'
    )
    assert.equal(catalog.categoryOf('EmployeeSpouse', 'employeeSpousePhone'), 'contacto')
    assert.equal(catalog.categoryOf('UserConsent', 'userConsentIp'), 'contacto')
    assert.equal(catalog.categoryOf('UserConsent', 'userConsentUserAgent'), 'contacto')
    assert.equal(catalog.categoryOf('EmpresaContratante', 'rfc'), 'identificacion')
    assert.equal(catalog.categoryOf('EmployeeSalaryHistory', 'salaryDaily'), 'financiero')
    assert.equal(catalog.categoryOf('PositionSalaryRange', 'minSalaryDaily'), 'financiero')
    assert.equal(catalog.categoryOf('PositionSalaryRange', 'maxSalaryDaily'), 'financiero')
  })

  test('TenantBillingProfile.rfc está clasificado pero queda fuera de esta rebanada', ({
    assert,
  }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('TenantBillingProfile', 'rfc'), 'identificacion')
  })
})

test.group('SensitiveFieldsCatalogService.revealEligibility', () => {
  test('maskedInApi es revelable', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.revealEligibility('Person', 'personCurp'), 'revealable')
  })

  test('clasificada sin maskedInApi no es revelable', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(
      catalog.revealEligibility('EmployeeBiometric', 'employeeBiometricData'),
      'not_revealable'
    )
    assert.equal(
      catalog.revealEligibility('WorkDisabilityNote', 'workDisabilityNoteDescription'),
      'not_revealable'
    )
  })

  test('par ausente del catálogo no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.revealEligibility('Person', 'personFirstname'), 'not_classified')
  })
})

test.group('LEGAL_CATEGORIES', () => {
  test('enumera exactamente las cinco categorías del type LegalCategory', ({ assert }) => {
    assert.deepEqual(
      [...LEGAL_CATEGORIES].sort(),
      ['biometrico', 'contacto', 'financiero', 'identificacion', 'salud']
    )
    const used = new Set(SENSITIVE_FIELDS.map((field) => field.legalCategory))
    for (const category of LEGAL_CATEGORIES) {
      assert.isTrue(used.has(category), `categoría huérfana: ${category}`)
    }
  })
})
