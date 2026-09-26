import { test } from '@japa/runner'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../../../app/constants/billing_subscription_error_codes.js'
import BillingTenantService from '../../../app/services/billing_tenant_service.js'

test.group('BillingTenantService.assertContractedEmployees', () => {
  const service = new BillingTenantService()

  test('acepta múltiplos de 10 desde 10 hasta 100000', ({ assert }) => {
    for (const value of [10, 20, 100, 100_000]) {
      assert.doesNotThrow(() => service.assertContractedEmployees(value))
    }
  })

  test('rechaza cantidades no múltiplo de 10 o menores a 10', ({ assert }) => {
    for (const value of [0, 5, 9, 25, -10]) {
      try {
        service.assertContractedEmployees(value)
        assert.fail(`debió fallar para ${value}`)
      } catch (error) {
        assert.equal(
          (error as { errorCode?: string }).errorCode,
          BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_NOT_BLOCK_OF_TEN
        )
      }
    }
  })

  test('rechaza cantidades sobre el tope defensivo', ({ assert }) => {
    try {
      service.assertContractedEmployees(100_010)
      assert.fail('debió fallar por tope defensivo')
    } catch (error) {
      assert.equal(
        (error as { errorCode?: string }).errorCode,
        BILLING_SUBSCRIPTION_ERROR_CODES.EMPLOYEES_ABOVE_SAFETY_CAP
      )
    }
  })
})

test.group('BillingTenantService.resolveMinimumContractedEmployees', () => {
  const service = new BillingTenantService()

  test('aplica el mínimo general y redondeo al bloque superior', ({ assert }) => {
    const cases: Array<[number, number]> = [
      [0, 10],
      [1, 10],
      [9, 10],
      [10, 10],
      [11, 20],
      [47, 50],
      [50, 50],
      [100_000, 100_000],
      [100_001, 100_010],
    ]

    for (const [active, expected] of cases) {
      assert.equal(
        service.resolveMinimumContractedEmployees(active),
        expected,
        `activos=${active}`
      )
    }
  })
})
