import { test } from '@japa/runner'
import { buildCalendarExportFileName } from '#constants/calendar_export'
import { buildReportJobFileName } from '#services/report_job_service'

/**
 * Nombres de descarga de los reportes de calendario y de los jobs asíncronos
 * de asistencia: siguen la convención única de `download_file_name` y no
 * dependen del idioma ni exponen datos del empleado.
 */

const PERIOD = { filterDate: '2026-09-01', filterDateEnd: '2026-09-15' }
const SLUG = '0b8f7c1e-3a54-4c1c-9d5e-2f1a8b6c4d3e'

test.group('Nombres de descarga — calendario', () => {
  test('arma {tipo}-{año}.xlsx por reporte', ({ assert }) => {
    assert.equal(buildCalendarExportFileName('holidays', 2026), 'festividades-2026.xlsx')
    assert.equal(buildCalendarExportFileName('birthdays', 2026), 'cumpleanos-2026.xlsx')
    assert.equal(buildCalendarExportFileName('anniversaries', 2026), 'aniversarios-2026.xlsx')
  })
})

test.group('Nombres de descarga — jobs de reporte de asistencia', () => {
  test('reporte de toda la empresa lleva solo el periodo', ({ assert }) => {
    assert.equal(
      buildReportJobFileName('assistance_all', PERIOD, null),
      'reporte-asistencia-2026-09-01-2026-09-15.xlsx'
    )
  })

  test('reporte por empleado lleva su slug, nunca nombre ni número', ({ assert }) => {
    assert.equal(
      buildReportJobFileName('assistance_employee', PERIOD, SLUG),
      `reporte-asistencia-${SLUG}-2026-09-01-2026-09-15.xlsx`
    )
  })

  test('resumen de incidencias y su variante de nómina', ({ assert }) => {
    assert.equal(
      buildReportJobFileName('assistance_incident_summary', PERIOD, null),
      'resumen-incidencias-2026-09-01-2026-09-15.xlsx'
    )
    assert.equal(
      buildReportJobFileName('assistance_incident_summary_payroll', PERIOD, SLUG),
      `resumen-incidencias-nomina-${SLUG}-2026-09-01-2026-09-15.xlsx`
    )
  })
})
