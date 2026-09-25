import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Los consumidores in-process de la configuración resuelven por EMPRESA ACTIVA.
 *
 * Antes este spec afirmaba lo contrario: que los ocho archivos seguían llamando
 * a `SystemSettingService.getActive()`, el método que devolvía la ficha base de
 * plataforma (`business_unit_id IS NULL`). Esa fila se retiró, y con ella el
 * método: servía la configuración de nadie —marca, umbrales de bloqueo y
 * tolerancias de asistencia— como si fuera la del cliente que preguntaba.
 *
 * Lo que se vigila ahora es que nadie vuelva a introducir esa resolución global.
 *
 * `supplie_service.ts` salió de la lista: su reporte Excel pasó a formato
 * neutral (sin logo ni color de la empresa) y ya no consulta la configuración.
 */

const IN_PROCESS_CALL_SITES = [
  'app/services/auth_mail_service.ts',
  'app/services/proceeding_file_service.ts',
  'app/services/traumatic_event_registry_report_service.ts',
  'app/services/traumatic_event_report_document_service.ts',
  'app/services/assist_service.ts',
  'app/services/sync_assists_service.ts',
  'app/services/employee_lactation_compliance_report_service.ts',
] as const

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf-8')

test.group('Configuración in-process — se resuelve por empresa activa', () => {
  test('los siete archivos resuelven con resolveForActiveTenant()', ({ assert }) => {
    for (const relativePath of IN_PROCESS_CALL_SITES) {
      const content = read(relativePath)
      assert.include(
        content,
        'resolveForActiveTenant()',
        `Falta la resolución por empresa activa en ${relativePath}`
      )
    }
  })

  test('ninguno vuelve a la configuración global de plataforma', ({ assert }) => {
    for (const relativePath of IN_PROCESS_CALL_SITES) {
      const content = read(relativePath)
      assert.notMatch(
        content,
        /\.getActive\s*\(/,
        `${relativePath} volvió a resolver la configuración de plataforma`
      )
    }
  })

  test('las tolerancias de asistencia salen de la empresa activa', ({ assert }) => {
    const content = read('app/services/assist_service.ts')

    assert.include(
      content,
      'resolveTenantToleranceMinutes(',
      'los tres métodos de tolerancia comparten la resolución por empresa'
    )
    assert.notInclude(
      content,
      'toleranceService.index(systemSettingActive.systemSettingId)',
      'la cadena vieja leía las tolerancias de la ficha de plataforma'
    )
  })
})
