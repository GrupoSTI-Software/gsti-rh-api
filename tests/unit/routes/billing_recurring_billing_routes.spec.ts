import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('billing_recurring_billing_routes — USRH1790708507781 CA-14', () => {
  test('GET recurring-billing lleva limitador billing-recurring-read', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "'billing-recurring-read'")
    assert.include(content, 'allowRequests(30)')
    assert.include(content, 'billing-recurring-read:${userId}')
    assert.include(content, 'ctx.request.ip()')

    const limiterBlock = content.match(
      /const billingRecurringReadRateLimit = limiter\.define\([\s\S]*?\n\}\)\n/
    )?.[0]
    assert.isDefined(limiterBlock)
    assert.notInclude(limiterBlock!, 'anonimo')

    assert.include(content, "'/subscription/recurring-billing'")
    assert.include(content, '#controllers/billing_recurring_billing_controller.show')
    assert.include(content, '.use(billingRecurringReadRateLimit)')
    assert.include(content, ".prefix('/api/billing')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})
