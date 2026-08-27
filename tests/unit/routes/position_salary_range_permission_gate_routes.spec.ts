import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('position_salary_range_routes — PermissionGate', () => {
  test('las 7 rutas declaran el gate de la acción correcta', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/position_salary_range_routes.ts'),
      'utf8'
    )
    const compacted = compact(content)

    assert.include(
      compacted,
      "post('/','#controllers/position_salary_range_controller.store').use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/','#controllers/position_salary_range_controller.index').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges))"
    )
    assert.include(
      compacted,
      "get('/current','#controllers/position_salary_range_controller.current').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/history','#controllers/position_salary_range_controller.history').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges))"
    )
    assert.include(
      compacted,
      "patch('/:positionSalaryRangeId','#controllers/position_salary_range_controller.update').use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/:positionSalaryRangeId/audit','#controllers/position_salary_range_controller.audit').use(middleware.permissionGate(POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange))"
    )
    assert.include(
      compacted,
      "delete('/:positionSalaryRangeId','#controllers/position_salary_range_controller.close').use(middleware.permissionGate(POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange))"
    )

    const gates = compacted.match(/permissionGate\([\w.]+\)/g) ?? []
    assert.equal(gates.length, 7, 'exactamente 7 gates, uno por ruta')
  })
})
