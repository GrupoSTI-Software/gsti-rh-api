import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROUTES_PATH = 'start/routes/platform_billing_routes.ts'

test.group('platform_billing_routes — vinculación Stripe (7553 / CA-15)', () => {
  test('declara link-stripe dentro del grupo auth + platformAdmin', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, 'middleware.auth(')
    assert.include(content, 'middleware.platformAdmin()')
    assert.include(
      content,
      "router.post(\n      '/plans/:planId/prices/:priceId/link-stripe',\n      '#controllers/billing_price_controller.linkStripe'\n    )"
    )
  })
})
