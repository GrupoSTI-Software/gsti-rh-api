import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058533 — ajuste adicional: `career_path_candidate_routes.ts` y
 * `user_responsible_employee_routes.ts` solo montaban `auth()`, sin declarar
 * la unidad activa (`businessScope()`). Sin ese middleware el candado
 * automático del modelo no se activa y el acceso por id ajeno no filtra.
 */

const CAREER_PATH_CANDIDATE_ROUTES_FILE = join(
  process.cwd(),
  'start/routes/career_path_candidate_routes.ts'
)
const USER_RESPONSIBLE_EMPLOYEE_ROUTES_FILE = join(
  process.cwd(),
  'start/routes/user_responsible_employee_routes.ts'
)
const ACCESS_POINT_ROUTES_FILE = join(process.cwd(), 'start/routes/access_point_routes.ts')

test.group('career_path_candidate_routes — scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(CAREER_PATH_CANDIDATE_ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/career-path-candidates')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('las rutas /:id y /employee/:employeeId (las fugas citadas) siguen expuestas bajo el grupo con scope', ({
    assert,
  }) => {
    const content = readFileSync(CAREER_PATH_CANDIDATE_ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "router.get('/:careerPathCandidateId', '#controllers/career_path_candidate_controller.show')"
    )
    assert.include(
      content,
      "router.get('/employee/:employeeId', '#controllers/career_path_candidate_controller.getByEmployeeId')"
    )
    // businessScope() debe estar en la misma cadena .use() del group, no ausente.
    const groupBlockEnd = content.indexOf(".prefix('/api/career-path-candidates')")
    const tail = content.slice(groupBlockEnd)
    assert.include(tail, 'middleware.auth()')
    assert.include(tail, 'middleware.businessScope()')
  })
})

test.group('user_responsible_employee_routes — scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(USER_RESPONSIBLE_EMPLOYEE_ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/user-responsible-employees')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('la ruta /:id (fuga citada) sigue expuesta bajo el grupo con scope', ({ assert }) => {
    const content = readFileSync(USER_RESPONSIBLE_EMPLOYEE_ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "'#controllers/user_responsible_employee_controller.show'"
    )
    const groupBlockEnd = content.indexOf(".prefix('/api/user-responsible-employees')")
    const tail = content.slice(groupBlockEnd)
    assert.include(tail, 'middleware.auth()')
    assert.include(tail, 'middleware.businessScope()')
  })
})

test.group('access_point_routes — corrección de calibración (no se tocó)', () => {
  test('ya montaba businessScope() antes de esta HU', ({ assert }) => {
    const content = readFileSync(ACCESS_POINT_ROUTES_FILE, 'utf-8')

    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})
