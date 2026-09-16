import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789018905983 — CA-6: los consumidores in-process de
 * `SystemSettingService.getActive()` siguen invocándolo sin argumentos.
 * Tras el determinismo por `whereNull('business_unit_id')`, todos reciben
 * la ficha base; este test deja constancia de que no hay llamadas con slugs.
 */

const IN_PROCESS_CALL_SITES = [
  'app/services/auth_mail_service.ts',
  'app/services/proceeding_file_service.ts',
  'app/services/traumatic_event_registry_report_service.ts',
  'app/services/traumatic_event_report_document_service.ts',
  'app/services/assist_service.ts',
  'app/services/supplie_service.ts',
  'app/services/sync_assists_service.ts',
  'app/services/employee_lactation_compliance_report_service.ts',
] as const

test.group('SystemSettingService.getActive — consumidores in-process (CA-6)', () => {
  test('los ocho archivos siguen invocando getActive() sin argumentos', ({ assert }) => {
    for (const relativePath of IN_PROCESS_CALL_SITES) {
      const content = readFileSync(join(process.cwd(), relativePath), 'utf-8')
      assert.include(
        content,
        'getActive()',
        `Falta invocación a getActive() en ${relativePath}`
      )
      assert.notMatch(
        content,
        /\.getActive\s*\(\s*[^)]/,
        `Invocación con argumentos detectada en ${relativePath}`
      )
    }
  })

  test('assist_service conserva la cadena de tolerancias sobre systemSettingId', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/assist_service.ts'), 'utf-8')
    assert.include(content, 'toleranceService.index(systemSettingActive.systemSettingId)')
  })
})
