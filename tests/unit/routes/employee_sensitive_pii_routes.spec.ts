import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783821206584 — hallazgo crítico: el mixin no filtra si la ruta no pasó
 * por `businessScope()`. Las rutas de administración de biométricos y
 * certificaciones deben declarar la unidad activa; los caminos de dispositivo
 * (`verify-face`) se dejan explícitamente sin ella.
 */

const ROUTES_DIR = join(process.cwd(), 'start/routes')

const ADMIN_ROUTE_FILES = [
  'employee_biometric_routes.ts',
  'employee_biometric_face_id_routes.ts',
  'employee_certification_routes.ts',
  'employee_certification_upload_routes.ts',
  'employee_certification_expiration_routes.ts',
] as const

test.group('PII sensible — rutas de administración con businessScope obligatorio', () => {
  for (const fileName of ADMIN_ROUTE_FILES) {
    test(`${fileName} monta auth() y businessScope()`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')

      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })
  }

  test('employee_routes.ts (salary-history) ya declaraba businessScope antes de esta HU', ({
    assert,
  }) => {
    const content = readFileSync(join(ROUTES_DIR, 'employee_routes.ts'), 'utf-8')

    assert.include(content, "router.get('/:employeeId/salary-history'")
    assert.include(content, 'middleware.businessScope()')
  })
})

test.group('PII sensible — caminos de dispositivo sin candado (por diseño)', () => {
  test('face_routes.ts (checado en sitio) NO monta businessScope', ({ assert }) => {
    const content = readFileSync(join(ROUTES_DIR, 'face_routes.ts'), 'utf-8')

    assert.include(content, "prefix('/api/verify-face')")
    assert.include(content, 'middleware.auth()')
    assert.notInclude(content, 'businessScope')
  })
})
