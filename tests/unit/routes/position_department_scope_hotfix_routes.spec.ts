import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Hotfix P0 — el grupo de rutas de creación/edición/borrado de posiciones y de
 * detalle/creación/edición/borrado de departamentos no montaba NINGÚN middleware
 * (ni siquiera `auth()`), permitiendo acceso sin sesión. Estos tests validan
 * únicamente el contenido del archivo de rutas (sin levantar servidor ni BD)
 * para que una regresión futura que vuelva a quitar el middleware falle rápido.
 *
 * Se compara sin espacios ni saltos: desde que el organigrama exige permisos,
 * cada ruta encadena su `permissionGate` y la declaración ocupa varias líneas.
 * Qué gate lleva cada ruta lo cuida
 * `supplies_organization_chart_permission_gate_routes.spec.ts`.
 */

const POSITION_ROUTES_FILE = join(process.cwd(), 'start/routes/position_routes.ts')
const DEPARTMENT_ROUTES_FILE = join(process.cwd(), 'start/routes/department_routes.ts')

const compact = (content: string) => content.replace(/\s+/g, '')

const readCompact = (file: string) => compact(readFileSync(file, 'utf-8'))

const routeDeclaration = (method: string, path: string, handler: string) =>
  compact(`router.${method}('${path}', '#controllers/${handler}')`)

/** Desde la ruta dada hasta el siguiente `router.group` (o el fin del archivo). */
function groupBlockFrom(content: string, declaration: string): string | null {
  const groupStart = content.indexOf(declaration)
  if (groupStart === -1) return null
  const groupEnd = content.indexOf('router.group', groupStart + 1)
  return groupEnd === -1 ? content.slice(groupStart) : content.slice(groupStart, groupEnd)
}

test.group('Positions — hotfix de scope en rutas de escritura', () => {
  test('el grupo store/update/delete/get monta auth() y businessScope()', ({ assert }) => {
    const block = groupBlockFrom(
      readCompact(POSITION_ROUTES_FILE),
      routeDeclaration('post', '/', 'position_controller.store')
    )
    assert.isNotNull(block, 'no se encontró el grupo de escritura de posiciones')

    assert.include(block, "prefix('/api/positions')")
    assert.include(block, 'middleware.auth()')
    assert.include(block, 'middleware.businessScope()')
  })

  test('las rutas store/update/delete/get siguen expuestas', ({ assert }) => {
    const content = readCompact(POSITION_ROUTES_FILE)

    assert.include(content, routeDeclaration('post', '/', 'position_controller.store'))
    assert.include(content, routeDeclaration('put', '/:positionId', 'position_controller.update'))
    assert.include(content, routeDeclaration('delete', '/:positionId', 'position_controller.delete'))
    assert.include(content, routeDeclaration('get', '/', 'position_controller.get'))
  })
})

test.group('Departments — hotfix de scope en rutas de escritura', () => {
  test('el grupo show/store/update/delete/force-delete monta auth() y businessScope()', ({ assert }) => {
    const block = groupBlockFrom(
      readCompact(DEPARTMENT_ROUTES_FILE),
      routeDeclaration('get', '/organization', 'department_controller.getOrganization')
    )
    assert.isNotNull(block, 'no se encontró el grupo de escritura de departamentos')

    assert.include(block, "prefix('/api/departments')")
    assert.include(block, 'middleware.auth()')
    assert.include(block, 'middleware.businessScope()')
  })

  test('las rutas show/store/sync-positions/update/delete/force-delete siguen expuestas', ({ assert }) => {
    const content = readCompact(DEPARTMENT_ROUTES_FILE)

    assert.include(content, routeDeclaration('get', '/:departmentId', 'department_controller.show'))
    assert.include(content, routeDeclaration('post', '/', 'department_controller.store'))
    assert.include(content, routeDeclaration('post', '/sync-positions', 'department_controller.syncPositions'))
    assert.include(content, routeDeclaration('put', '/:departmentId', 'department_controller.update'))
    assert.include(content, routeDeclaration('delete', '/:departmentId', 'department_controller.delete'))
    assert.include(
      content,
      routeDeclaration('delete', '/:departmentId/force-delete', 'department_controller.forceDelete')
    )
  })
})
