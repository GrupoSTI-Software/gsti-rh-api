import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789018905950 — `GET /api/system-settings/:systemSettingId` era la única
 * ruta del grupo sin middleware. Este test valida que monte `auth()` y
 * `businessScope()` obligatorios, cerrando la lectura enumerable sin credenciales.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/system_setting_routes.ts')

test.group('SystemSetting show — rutas con scope obligatorio', () => {
  test('la ruta show monta auth() y businessScope() en ese orden', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/system-settings')")
    assert.include(
      content,
      "router.get('/:systemSettingId', '#controllers/system_setting_controller.show').use(middleware.auth()).use(middleware.businessScope())"
    )
  })

  test('las demás rutas del grupo conservan su montaje', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "router.get('/', '#controllers/system_setting_controller.index').use(middleware.auth()).use(middleware.businessScope())"
    )
    assert.include(
      content,
      "router.post('/', '#controllers/system_setting_controller.store').use(middleware.auth()).use(middleware.businessScope())"
    )
    assert.include(
      content,
      "router.put('/:systemSettingId', '#controllers/system_setting_controller.update').use(middleware.auth()).use(middleware.businessScope())"
    )
    assert.include(
      content,
      "router.delete('/:systemSettingId', '#controllers/system_setting_controller.delete').use(middleware.auth()).use(middleware.businessScope())"
    )
  })

  test('show sigue apuntando al mismo manejador', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "'#controllers/system_setting_controller.show'")
  })
})
