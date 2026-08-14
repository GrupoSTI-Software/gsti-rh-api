import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1785766406719 — las rutas de fotos de insumos solo montaban auth().
 * Deben exigir businessScope() para activar TenantContext y el header de empresa.
 */

const ROUTES_FILE = join(
  process.cwd(),
  'start/routes/employee_supply_assignament_photo.ts'
)

test.group('EmployeeSupplyAssignationPhoto — rutas con scope obligatorio', () => {
  test('el grupo monta auth() y businessScope()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api')")
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('las cinco rutas del apartado siguen expuestas', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(
      content,
      "'#controllers/employee_supplie_assignation_photos_controller.uploadAssignation'"
    )
    assert.include(
      content,
      "'#controllers/employee_supplie_assignation_photos_controller.uploadReturn'"
    )
    assert.include(
      content,
      "'#controllers/employee_supplie_assignation_photos_controller.getAssignation'"
    )
    assert.include(
      content,
      "'#controllers/employee_supplie_assignation_photos_controller.getReturn'"
    )
    assert.include(
      content,
      "'#controllers/employee_supplie_assignation_photos_controller.delete'"
    )
  })
})
