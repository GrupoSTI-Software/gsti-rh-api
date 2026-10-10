import { test } from '@japa/runner'
import { restrictMySubscription } from '#helpers/billing_tenant_visibility'
import type { MySubscriptionResult } from '#services/billing_tenant_service'

test.group('restrictMySubscription — automaticBilling USRH1790708507781 CA-2', () => {
  test('conserva automaticBilling en la respuesta recortada', ({ assert }) => {
    const full: MySubscriptionResult = {
      businessUnitOrigin: 'self_service',
      subscription: null,
      renewal: null,
      accountStatus: 'active',
      automaticBilling: true,
      minimumContractedEmployees: 10,
    }

    const restricted = restrictMySubscription(full)

    assert.equal(restricted.automaticBilling, true)
    assert.isNull(restricted.subscription)
    assert.equal(restricted.accountStatus, 'active')
  })
})
