import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783372659486 — el grupo `/api/employees-proceeding-files` solo montaba
 * `auth()` (más `businessScopeOptional()` únicamente en `download`). Este test
 * valida que el grupo completo (index/store/update/delete/show/download) monte
 * `businessScope()` obligatorio, cerrando el acceso directo a expedientes de
 * otra empresa por el PK del vínculo.
 */

const ROUTES_FILE = join(
  process.cwd(),
  'start/routes/employee_proceeding_file_routes.ts'
)

test.group('EmployeeProceedingFile — rutas con scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/employees-proceeding-files')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('download ya no depende de un middleware de scope individual', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    // El scope ahora lo impone el middleware del grupo; el route-level
    // businessScopeOptional() quedaría redundante/inconsistente con el resto
    // del grupo (que exige el header de forma obligatoria).
    assert.notInclude(content, 'businessScopeOptional')
  })

  test('las rutas index/store/update/delete/show/download siguen expuestas', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "router.get('/', '#controllers/employee_proceeding_file_controller.index')")
    assert.include(content, "router.post('/', '#controllers/employee_proceeding_file_controller.store')")
    assert.include(
      content,
      "'#controllers/employee_proceeding_file_controller.update'"
    )
    assert.include(
      content,
      "'#controllers/employee_proceeding_file_controller.delete'"
    )
    assert.include(content, "'#controllers/employee_proceeding_file_controller.show'")
    assert.include(
      content,
      "'#controllers/employee_proceeding_file_controller.download'"
    )
  })
})
