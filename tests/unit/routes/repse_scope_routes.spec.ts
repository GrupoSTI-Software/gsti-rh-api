import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783691644909 — los 7 grupos de rutas REPSE deben montar
 * `auth()` + `businessScope()`. Recreado tras pérdida de archivos untracked
 * — ver commit cbaba6cc.
 */

const ROUTES_DIR = join(process.cwd(), 'start/routes')

const REPSE_ROUTE_FILES = [
  'repse_registration_routes.ts',
  'repse_specialized_service_routes.ts',
  'repse_coverage_report_routes.ts',
  'contratos_servicios_especializados_routes.ts',
  'asignaciones_contrato_especializado_routes.ts',
  'documentos_contrato_especializado_routes.ts',
  'versiones_contrato_especializado_routes.ts',
] as const

const SHARED_ROUTE_FILES = ['branch_offices.ts', 'attendance_stats_routes.ts'] as const

test.group('REPSE — rutas con scope central obligatorio', () => {
  for (const fileName of REPSE_ROUTE_FILES) {
    test(`${fileName} monta auth() y businessScope()`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')

      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })

    if (fileName === 'repse_registration_routes.ts') {
      test(`${fileName} declara get-expired-and-expiring antes de /:id`, ({ assert }) => {
        const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')
        const expiredIdx = content.indexOf('get-expired-and-expiring')
        const idRouteIdx = content.indexOf('/repse-registrations/:id')

        assert.isAbove(expiredIdx, -1)
        assert.isAbove(idRouteIdx, -1)
        assert.isBelow(expiredIdx, idRouteIdx)
      })
    }
  }
})

test.group('REPSE — censo de rutas compartidas que usan el helper', () => {
  for (const fileName of SHARED_ROUTE_FILES) {
    test(`${fileName} ya monta businessScope() (TenantContext activo)`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')

      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })
  }
})
