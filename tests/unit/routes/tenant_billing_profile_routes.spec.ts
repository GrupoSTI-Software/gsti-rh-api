import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('tenant_billing_profile_routes — escritura (USRH1786737531066)', () => {
  test('PUT /profile lleva limitador tenant-billing-profile-write por userId', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'start/routes/tenant_billing_profile_routes.ts'),
      'utf-8'
    )

    assert.include(content, "'tenant-billing-profile-write'")
    assert.include(content, 'limiter.define(')
    assert.include(content, 'allowRequests(20)')
    assert.include(content, 'tenant-billing-profile-write:${userId}')
    assert.include(content, ".put('/profile'")
    assert.include(content, '.use(tenantBillingProfileWriteRateLimit)')
  })

  test('GET /profile no lleva limitador de escritura', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'start/routes/tenant_billing_profile_routes.ts'),
      'utf-8'
    )

    const getRoute = content.match(
      /router\.get\('\/profile'[\s\S]*?\n\s*router/m
    )?.[0]

    assert.isDefined(getRoute)
    assert.notInclude(getRoute!, 'tenantBillingProfileWriteRateLimit')
  })
})
