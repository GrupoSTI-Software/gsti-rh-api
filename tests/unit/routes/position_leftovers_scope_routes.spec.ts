import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058555 — las últimas dos rutas huérfanas del dominio posición:
 * `position_approval_history_routes.ts` y `position_certification_requirement_routes.ts`
 * montaban solo `auth()`. `branch_office_shift_quota_routes.ts` ya montaba
 * `businessScope()` desde antes — no requiere enganche, solo se verifica.
 */

const POSITION_APPROVAL_HISTORY_ROUTES_FILE = join(
  process.cwd(),
  'start/routes/position_approval_history_routes.ts'
)
const POSITION_CERTIFICATION_REQUIREMENT_ROUTES_FILE = join(
  process.cwd(),
  'start/routes/position_certification_requirement_routes.ts'
)
const BRANCH_OFFICE_SHIFT_QUOTA_ROUTES_FILE = join(
  process.cwd(),
  'start/routes/branch_office_shift_quota_routes.ts'
)

test.group('position_approval_history_routes — scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(POSITION_APPROVAL_HISTORY_ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/position-approval-histories')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('store y getLast (last/:positionId) siguen expuestos bajo el grupo con scope', ({
    assert,
  }) => {
    const content = readFileSync(POSITION_APPROVAL_HISTORY_ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "router.post('/', '#controllers/position_approval_history_controller.store')"
    )
    assert.include(
      content,
      "router.get('/last/:positionId', '#controllers/position_approval_history_controller.getLast')"
    )
  })
})

test.group('position_certification_requirement_routes — scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(POSITION_CERTIFICATION_REQUIREMENT_ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/positions')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('index/store/destroy de certification-requirements siguen expuestos', ({ assert }) => {
    const content = readFileSync(POSITION_CERTIFICATION_REQUIREMENT_ROUTES_FILE, 'utf-8')

    assert.include(content, "'/:positionId/certification-requirements'")
    assert.include(
      content,
      "'#controllers/position_certification_requirement_controller.index'"
    )
    assert.include(
      content,
      "'#controllers/position_certification_requirement_controller.store'"
    )
    assert.include(
      content,
      "'#controllers/position_certification_requirement_controller.destroy'"
    )
  })
})

test.group('branch_office_shift_quota_routes — corrección de calibración (no se tocó)', () => {
  test('ya montaba businessScope() antes de esta HU', ({ assert }) => {
    const content = readFileSync(BRANCH_OFFICE_SHIFT_QUOTA_ROUTES_FILE, 'utf-8')

    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })
})
