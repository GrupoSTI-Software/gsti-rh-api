import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789018905983 — las dos vías que quedaban públicas pasan a exigir
 * `auth()`. Ninguna ruta del archivo debe quedar sin middleware.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/system_setting_routes.ts')

test.group('SystemSetting public — rutas con auth obligatorio (CA-10)', () => {
  test('system-settings-active y get-payroll-config montan auth()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "router.get('/', '#controllers/system_setting_controller.getActive').use(middleware.auth())"
    )
    assert.include(
      content,
      "router.get('/', '#controllers/system_setting_controller.getPayrollConfig').use(middleware.auth())"
    )
  })

  test('los manejadores siguen apuntando a getActive y getPayrollConfig', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "'#controllers/system_setting_controller.getActive'")
    assert.include(content, "'#controllers/system_setting_controller.getPayrollConfig'")
  })

  test('ninguna ruta del archivo queda sin middleware', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    const routeLines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.startsWith('router.get') ||
          line.startsWith('router.post') ||
          line.startsWith('router.put') ||
          line.startsWith('router.delete')
      )

    for (const line of routeLines) {
      assert.include(line, '.use(middleware.', `Ruta sin middleware: ${line}`)
    }
  })
})
