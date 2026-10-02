import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROUTES_PATH = 'start/routes/billing_provider_webhook_routes.ts'

test.group('billing_provider_webhook_routes — CA-13', () => {
  test('declara POST /stripe bajo /api/webhooks sin auth ni limitador', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, "router.post('/stripe', '#controllers/billing_provider_webhook_controller.stripe')")
    assert.include(content, ".prefix('/api/webhooks')")
    assert.notInclude(content, 'middleware.auth(')
    assert.notInclude(content, 'businessScope')
    assert.notInclude(content, 'permissionGate')
    assert.notInclude(content, 'limiter')
  })

  test('start/routes.ts importa billing_provider_webhook_routes.js', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(content, "import './routes/billing_provider_webhook_routes.js'")
  })
})
