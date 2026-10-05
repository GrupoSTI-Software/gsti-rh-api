import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()
const TO_DELETE = join(ROOT, '__TO_DELETE__')

async function archived(relativePath: string): Promise<boolean> {
  try {
    await access(join(TO_DELETE, relativePath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function liveMissing(relativePath: string): Promise<boolean> {
  try {
    await access(join(ROOT, relativePath), constants.F_OK)
    return false
  } catch {
    return true
  }
}

test.group('Rutas biométricas legacy retiradas — contrato estático (USRH1790276646847)', () => {
  test('start/routes.ts ya no importa synchronization_routes ni face_routes', async ({ assert }) => {
    const routes = await readFile(join(ROOT, 'start/routes.ts'), 'utf8')

    assert.notInclude(routes, 'synchronization_routes')
    assert.notInclude(routes, 'face_routes')
  })

  test('los archivos retirados viven en __TO_DELETE__ y no en la ruta viva', async ({ assert }) => {
    const archivedPaths = [
      'start/routes/synchronization_routes.ts',
      'start/routes/face_routes.ts',
      'app/controllers/face_controller.ts',
      'tests/unit/services/employee_sync_create_release.spec.ts',
    ]

    for (const relativePath of archivedPaths) {
      assert.isTrue(await archived(relativePath), `${relativePath} debe estar archivado`)
      assert.isTrue(await liveMissing(relativePath), `${relativePath} no debe existir en la ruta viva`)
    }
  })

  test('declaraciones sync* retiradas; inverseSyncEmployee (manage-biotime) se conserva', async ({
    assert,
  }) => {
    const declarations = await readFile(
      join(ROOT, 'app/constants/employees_write_permission_declarations.ts'),
      'utf8'
    )

    assert.notInclude(declarations, 'syncDepartments')
    assert.notInclude(declarations, 'syncPositions')
    assert.notInclude(declarations, 'syncEmployees')
    assert.notInclude(declarations, 'syncShift')
    assert.notInclude(declarations, 'syncEmployeesBySelection')
    assert.include(declarations, 'inverseSyncEmployee')
    assert.include(declarations, "employeesStandard('manage-biotime')")
  })

  test('controladores ya no exponen synchronization ni verify privado de sync', async ({ assert }) => {
    for (const relativePath of [
      'app/controllers/department_controller.ts',
      'app/controllers/position_controller.ts',
      'app/controllers/employee_controller.ts',
    ]) {
      const content = await readFile(join(ROOT, relativePath), 'utf8')

      assert.notMatch(content, /\basync synchronization\b/, relativePath)
      assert.notMatch(content, /\basync synchronizationBySelection\b/, relativePath)
      assert.notInclude(content, 'private async verify(', relativePath)
    }
  })

  test('employee_service ya no expone syncCreate biométrico', async ({ assert }) => {
    const service = await readFile(join(ROOT, 'app/services/employee_service.ts'), 'utf8')

    assert.notMatch(service, /\basync syncCreate\(/)
  })
})
