import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Hotfix P0 — el grupo de rutas de creación/edición/borrado de posiciones y de
 * detalle/creación/edición/borrado de departamentos no montaba NINGÚN middleware
 * (ni siquiera `auth()`), permitiendo acceso sin sesión. Estos tests validan
 * únicamente el contenido del archivo de rutas (sin levantar servidor ni BD)
 * para que una regresión futura que vuelva a quitar el middleware falle rápido.
 */

const POSITION_ROUTES_FILE = join(process.cwd(), 'start/routes/position_routes.ts')
const DEPARTMENT_ROUTES_FILE = join(process.cwd(), 'start/routes/department_routes.ts')

test.group('Positions — hotfix de scope en rutas de escritura', () => {
  test('el grupo store/update/delete/get monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(POSITION_ROUTES_FILE, 'utf-8')

    const groupStart = content.indexOf("router.post('/', '#controllers/position_controller.store')")
    assert.isAbove(groupStart, -1, 'no se encontró el grupo de escritura de posiciones')

    // El bloque del grupo debe cerrar con el prefix y montar ambos middlewares
    // antes de la siguiente declaración de grupo (o fin de archivo).
    const groupEnd = content.indexOf('router\n  .group', groupStart + 1)
    const block = groupEnd === -1 ? content.slice(groupStart) : content.slice(groupStart, groupEnd)

    assert.include(block, "prefix('/api/positions')")
    assert.include(block, 'middleware.auth()')
    assert.include(block, 'middleware.businessScope()')
  })

  test('las rutas store/update/delete/get siguen expuestas', ({ assert }) => {
    const content = readFileSync(POSITION_ROUTES_FILE, 'utf-8')

    assert.include(content, "router.post('/', '#controllers/position_controller.store')")
    assert.include(content, "router.put('/:positionId', '#controllers/position_controller.update')")
    assert.include(content, "router.delete('/:positionId', '#controllers/position_controller.delete')")
    assert.include(content, "router.get('/', '#controllers/position_controller.get')")
  })
})

test.group('Departments — hotfix de scope en rutas de escritura', () => {
  test('el grupo show/store/update/delete/force-delete monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_ROUTES_FILE, 'utf-8')

    const groupStart = content.indexOf("router.get('/organization', '#controllers/department_controller.getOrganization')")
    assert.isAbove(groupStart, -1, 'no se encontró el grupo de escritura de departamentos')

    const groupEnd = content.indexOf('router.group', groupStart + 1)
    const block = groupEnd === -1 ? content.slice(groupStart) : content.slice(groupStart, groupEnd)

    assert.include(block, "prefix('/api/departments')")
    assert.include(block, 'middleware.auth()')
    assert.include(block, 'middleware.businessScope()')
  })

  test('las rutas show/store/sync-positions/update/delete/force-delete siguen expuestas', ({ assert }) => {
    const content = readFileSync(DEPARTMENT_ROUTES_FILE, 'utf-8')

    assert.include(content, "router.get('/:departmentId', '#controllers/department_controller.show')")
    assert.include(content, "router.post('/', '#controllers/department_controller.store')")
    assert.include(content, "router.post('/sync-positions', '#controllers/department_controller.syncPositions')")
    assert.include(content, "router.put('/:departmentId', '#controllers/department_controller.update')")
    assert.include(content, "router.delete('/:departmentId', '#controllers/department_controller.delete')")
    assert.include(content, "router.delete('/:departmentId/force-delete', '#controllers/department_controller.forceDelete')")
  })
})
