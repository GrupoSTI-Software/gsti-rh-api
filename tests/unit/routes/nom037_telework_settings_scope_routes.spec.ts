import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * VLRH-H1791306074375 — CA-14.
 *
 * El grupo de rutas de los ajustes de teletrabajo (`/api/nom037/telework-settings`)
 * debe montarse al final de `nom037_routes.ts` con `prefix('/api')`, `auth()` y
 * `businessScope()` encadenados —la empresa sale del header `X-Business-Unit-Id`—
 * y sin ruta de borrado (singleton por empresa). Este spec lee el archivo de rutas
 * y verifica el montaje; no lo ejecuta.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/nom037_routes.ts')

test.group('telework-settings — rutas con scope obligatorio (CA-14)', () => {
  test('el grupo de telework-settings monta prefix, auth y businessScope en ese orden', ({
    assert,
  }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8').replace(/\s+/g, '')

    assert.include(
      content,
      "router.group(()=>{router.get('/nom037/telework-settings','#controllers/telework_compliance_setting_controller.show')router.put('/nom037/telework-settings','#controllers/telework_compliance_setting_controller.update')}).prefix('/api').use(middleware.auth()).use(middleware.businessScope())"
    )
  })

  test('no hay ruta de borrado para el prefijo de telework-settings', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.isFalse(/router\.delete\(\s*'\/nom037\/telework-settings/.test(content))
  })

  test('los grupos existentes conservan su montaje', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8').replace(/\s+/g, '')

    // El grupo de la Política de Teletrabajo (NOM-037) sigue con auth + businessScope.
    assert.include(
      content,
      "'/nom037/telework-policy/remind-pending','#modules/telework-policy/telework_policy.controller.remindPending')}).prefix('/api').use(middleware.auth()).use(middleware.businessScope())"
    )
    // El grupo anidado de lugares de teletrabajo conserva su businessScope.
    assert.include(content, ".prefix('/nom037/telework-locations').use(middleware.businessScope())")
  })
})
