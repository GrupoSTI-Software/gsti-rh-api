import { test } from '@japa/runner'
import {
  EMPLOYEES_PERMISSION_CATALOG,
  validateCatalogIntegrity,
} from '#constants/system_permission_catalog'
import { SystemPermissionCatalogError } from '#exceptions/system_permission_catalog_error'

/**
 * Blindaje de integridad del catálogo granular de Empleados (USRH1785766406722,
 * Task 4): reglas 13 (sync idempotente respaldado por catálogo válido) y 14
 * (duplicados detienen el registro antes de sync).
 */

test.group('EMPLOYEES_PERMISSION_CATALOG — guardas de integridad (Task 4)', () => {
  test('ninguna sección de pestaña inventada: solo EmployeesSection conocidas', ({
    assert,
  }) => {
    const allowed = new Set<string>([
      'foto',
      'trabajo',
      'persona',
      'condicion-medica',
      'periodos-lactancia',
      'expediente',
      'consentimiento',
      'domicilio',
      'bancos',
      'responsable',
      'zonas',
      'asignados',
      'biometricos',
      'anotaciones',
      'dispositivos',
      'evaluaciones',
      'assessments',
      'ruta-carrera',
      'certificaciones',
      'listado',
      'descargas',
      'datos-sensibles',
      'turnos',
      'app-colaborador',
    ])
    for (const action of EMPLOYEES_PERMISSION_CATALOG) {
      assert.isTrue(allowed.has(action.section), action.section)
    }
  })

  test('validateCatalogIntegrity detiene duplicados antes de sync', ({ assert }) => {
    assert.throws(
      () =>
        validateCatalogIntegrity({
          modules: [{ slug: 'employees', actionsEnumerated: true }],
          actionsByModule: {
            employees: [
              { slug: 'dup', displayName: 'a', kind: 'read', section: 'bancos' },
              { slug: 'dup', displayName: 'b', kind: 'write', section: 'bancos' },
            ],
          },
        }),
      SystemPermissionCatalogError
    )
  })
})
