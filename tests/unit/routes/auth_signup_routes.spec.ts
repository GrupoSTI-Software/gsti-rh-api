import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/** USRH1790718243123 — CA-11 */
const ROUTES_FILE = join(process.cwd(), 'start/routes/auth_signup_routes.ts')

test.group('auth_signup_routes — setup-intent (USRH1790718243123)', () => {
  test('declara limitador signup-setup-intent 10/min y ruta setup-intent sin auth', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "limiter.define('signup-setup-intent'")
    assert.include(content, 'allowRequests(10)')
    assert.include(
      content,
      "router.post('/setup-intent', '#controllers/auth_signup_controller.setupIntent')"
    )
    assert.include(content, '.use(signupSetupIntentRateLimit)')

    const setupBlockStart = content.indexOf("router.post('/setup-intent'")
    const setupBlock = content.slice(setupBlockStart, setupBlockStart + 400)
    assert.notInclude(setupBlock, 'middleware.auth')
  })
})
