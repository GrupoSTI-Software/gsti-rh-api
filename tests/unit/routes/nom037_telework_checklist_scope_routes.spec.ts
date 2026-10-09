import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * VLRH-H1790812613870 — frontera del API de la lista de verificación de
 * teletrabajo (CA-8).
 *
 * El grupo de rutas de la lista de verificación (`/api/nom037/telework-checklists`)
 * debe montarse al final de `nom037_routes.ts` con `prefix('/api')`, `auth()` y
 * `businessScope()` encadenados —la empresa sale del header `X-Business-Unit-Id`—
 * y sin ruta de borrado (nada se elimina). Las cuatro rutas y su orden son el
 * contrato de la HU; `:employeeId` y `:applicationId` solo aceptan números. Este
 * spec lee el archivo de rutas y verifica el montaje; no lo ejecuta.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/nom037_routes.ts')

test.group('telework-checklists — rutas con scope obligatorio (CA-8)', () => {
  test('el grupo de telework-checklists monta prefix, auth y businessScope en ese orden', ({
    assert,
  }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8').replace(/\s+/g, '')

    assert.include(
      content,
      "router.group(()=>{router.get('/nom037/telework-checklists/items','#modules/telework-checklist/telework_checklist.controller.listItems')router.get('/nom037/telework-checklists/employees/:employeeId','#modules/telework-checklist/telework_checklist.controller.listByEmployee').where('employeeId',router.matchers.number())router.get('/nom037/telework-checklists/:applicationId','#modules/telework-checklist/telework_checklist.controller.detail').where('applicationId',router.matchers.number())router.post('/nom037/telework-checklists','#modules/telework-checklist/telework_checklist.controller.registerVisit')}).prefix('/api').use(middleware.auth()).use(middleware.businessScope())"
    )
  })

  test('no hay ruta de borrado para el prefijo de telework-checklists', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.isFalse(/router\.delete\(\s*'\/nom037\/telework-checklists/.test(content))
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
