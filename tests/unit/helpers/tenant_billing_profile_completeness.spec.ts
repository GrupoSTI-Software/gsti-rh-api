import { test } from '@japa/runner'
import { computeBillingProfileCompleteness } from '../../../app/helpers/tenant_billing_profile_completeness.js'

const completeProfile = {
  rfc: 'ABC010101AB9',
  legalName: 'Abc SA de CV',
  postalCode: '06600',
  taxRegimeCode: '601',
  cfdiUseCode: 'G03',
}

test.group('computeBillingProfileCompleteness', () => {
  test('perfil con los cinco campos obligatorios → complete true', ({ assert }) => {
    const result = computeBillingProfileCompleteness(completeProfile)

    assert.isTrue(result.complete)
    assert.deepEqual(result.missingFields, [])
  })

  test('sin RFC lista rfc y demás campos faltantes en orden fijo', ({ assert }) => {
    const result = computeBillingProfileCompleteness({
      rfc: null,
      legalName: 'Empresa SA',
      postalCode: null,
      taxRegimeCode: '612',
      cfdiUseCode: null,
    })

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, ['rfc', 'postalCode', 'cfdiUseCode'])
  })

  test('perfil vacío heredado → los cinco campos pendientes', ({ assert }) => {
    const result = computeBillingProfileCompleteness({
      rfc: null,
      legalName: 'Nombre legal heredado',
      postalCode: null,
      taxRegimeCode: null,
      cfdiUseCode: null,
    })

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, [
      'rfc',
      'postalCode',
      'taxRegimeCode',
      'cfdiUseCode',
    ])
  })

  test('legalName en blanco cuenta como faltante', ({ assert }) => {
    const result = computeBillingProfileCompleteness({
      ...completeProfile,
      legalName: '   ',
    })

    assert.isFalse(result.complete)
    assert.deepEqual(result.missingFields, ['legalName'])
  })
})
