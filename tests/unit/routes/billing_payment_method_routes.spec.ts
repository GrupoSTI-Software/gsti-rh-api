import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('billing_payment_method_routes — lectura (USRH1790724549203)', () => {
  test('GET /subscription/payment-method lleva limitador billing-payment-method-read', ({
    assert,
  }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "'billing-payment-method-read'")
    assert.include(content, 'limiter.define(')
    assert.include(content, 'allowRequests(30)')
    assert.include(content, 'billing-payment-method-read:${userId}')
    assert.include(content, 'ctx.request.ip()')

    const limiterBlock = content.match(
      /const billingPaymentMethodReadRateLimit = limiter\.define\([\s\S]*?\n\}\)\n/
    )?.[0]
    assert.isDefined(limiterBlock)
    assert.notInclude(limiterBlock!, 'anonimo')

    assert.include(content, "'/subscription/payment-method'")
    assert.include(content, '#controllers/billing_payment_method_controller.show')
    assert.include(content, '.use(billingPaymentMethodReadRateLimit)')
    assert.include(content, ".prefix('/api/billing')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})

test.group('billing_payment_method_routes — escritura (USRH1790708507752)', () => {
  test('POST setup-intent y POST payment-method llevan limitador billing-payment-method-write', ({
    assert,
  }) => {
    const content = readFileSync(join(process.cwd(), 'start/routes/billing_routes.ts'), 'utf-8')

    assert.include(content, "'billing-payment-method-write'")
    assert.include(content, 'allowRequests(10)')
    assert.include(content, "'/subscription/payment-method/setup-intent'")
    assert.include(content, '#controllers/billing_payment_method_controller.setupIntent')
    assert.include(content, '#controllers/billing_payment_method_controller.update')
    assert.include(content, '.use(billingPaymentMethodWriteRateLimit)')

    const limiterBlock = content.match(
      /const billingPaymentMethodWriteRateLimit = limiter\.define\([\s\S]*?\n\}\)\n/
    )?.[0]
    assert.isDefined(limiterBlock)
    assert.notInclude(limiterBlock!, 'anonimo')
  })
})
