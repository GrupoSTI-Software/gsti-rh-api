import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { TenantContext } from '#utils/tenant_context'
import { getAllowedBusinessUnitIds } from '../../../app/helpers/repse_tenant_scope.js'

/**
 * USRH1783691644909 — el helper REPSE deja de leer `SYSTEM_BUSINESS` y resuelve
 * el alcance desde `TenantContext` (fail-closed si no hay contexto activo).
 *
 * Recreado tras una pérdida de archivos untracked al restablecer la BD; el
 * código de producción (helper, modelos, rutas) permanece intacto y
 * committeado — ver commit cbaba6cc.
 */

const HELPER_FILE = join(process.cwd(), 'app/helpers/repse_tenant_scope.ts')

const CONSUMER_FILES = [
  'app/services/empresa_contratante_service.ts',
  'app/services/repse_registration_service.ts',
  'app/services/asignacion_contrato_especializado_service.ts',
  'app/services/contrato_servicio_especializado_service.ts',
  'app/services/repse_specialized_service_service.ts',
  'app/services/version_contrato_especializado_service.ts',
  'app/services/documento_contrato_especializado_service.ts',
  'app/services/branch_office_service.ts',
  'app/modules/repse-coverage-report/repse_coverage_report.service.ts',
  'app/modules/attendance-stats/attendance-stats.service.ts',
] as const

test.group('repse_tenant_scope — fuente del alcance', () => {
  test('el helper no lee SYSTEM_BUSINESS ni #start/env', ({ assert }) => {
    const content = readFileSync(HELPER_FILE, 'utf-8')

    assert.notInclude(content, 'SYSTEM_BUSINESS')
    assert.notInclude(content, '#start/env')
    assert.include(content, "import { TenantContext } from '#utils/tenant_context'")
    assert.include(content, 'TenantContext.getScope()')
  })

  test('getAllowedBusinessUnitIds devuelve el scope del TenantContext activo', async ({
    assert,
  }) => {
    const ids = await TenantContext.run([42, 99], () => getAllowedBusinessUnitIds())

    assert.deepEqual(ids, [42, 99])
  })

  test('sin TenantContext activo, getAllowedBusinessUnitIds falla cerrado (vacío)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())
    const ids = await getAllowedBusinessUnitIds()
    assert.deepEqual(ids, [])
  })
})

test.group('repse_tenant_scope — consumidores sin SYSTEM_BUSINESS', () => {
  for (const relativePath of CONSUMER_FILES) {
    test(`${relativePath} no menciona SYSTEM_BUSINESS`, ({ assert }) => {
      const content = readFileSync(join(process.cwd(), relativePath), 'utf-8')
      assert.notInclude(content, 'SYSTEM_BUSINESS')
    })
  }
})
