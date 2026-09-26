import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('platform_tenant_controller — OpenAPI (USRH1786737531069)', () => {
  const content = readFileSync(
    join(process.cwd(), 'app/controllers/platform_tenant_controller.ts'),
    'utf-8'
  )

  test('index documenta búsqueda por RFC completo válido SAT', ({ assert }) => {
    assert.include(content, '@swagger')
    assert.include(content, '/api/platform/tenants:')
    assert.include(content, 'RFC completo válido SAT')
    assert.include(content, 'listPlatformTenants')
    assert.include(content, '@index')
  })

  test('show documenta billingProfile en la respuesta 200', ({ assert }) => {
    assert.include(content, '/api/platform/tenants/{id}:')
    assert.include(content, 'billingProfile')
    assert.include(content, 'taxRegimeLabel')
    assert.include(content, 'cfdiUseLabel')
    assert.include(content, 'billingProfileComplete')
    assert.include(content, 'getPlatformTenantDetail')
    assert.include(content, '@show')
  })
})
