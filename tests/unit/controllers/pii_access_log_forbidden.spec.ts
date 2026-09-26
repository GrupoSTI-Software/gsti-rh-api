import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('PiiAccessLogController permiso de consulta', () => {
  test('index llama ensurePiiAccessLogRead antes de validar el query', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/pii_access_log_controller.ts'),
      'utf-8'
    )
    assert.include(source, "import { ensurePiiAccessLogRead } from '#helpers/ensure_pii_access_log_read'")
    assert.include(source, 'await ensurePiiAccessLogRead(ctx)')
    const ensureIndex = source.indexOf('await ensurePiiAccessLogRead(ctx)')
    const validateIndex = source.indexOf('request.validateUsing(piiAccessLogsListValidator)')
    assert.isBelow(ensureIndex, validateIndex)
    assert.notInclude(source, 'middleware.permissionGate')
    assert.notInclude(source, 'RoleService')
  })

  test('el traductor ya mapea FORBIDDEN a consulta-bitacora-denegada', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/helpers/pii_audit_api_error.ts'), 'utf-8')
    assert.include(source, "FORBIDDEN]: 'consulta-bitacora-denegada'")
  })
})
