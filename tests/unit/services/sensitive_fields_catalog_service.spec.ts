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

  test('devuelve null si el par modelo/columna no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.isNull(catalog.categoryOf('Person', 'personFirstname'))
    assert.isNull(catalog.categoryOf('Employee', 'dailySalary'))
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
