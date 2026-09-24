import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { formatReportGeneratedAt, REPORT_LOCALE, reportI18n } from '#helpers/report_locale'

test.group('Idioma de los reportes', () => {
  test('el traductor de reportes es español aunque la petición llegue en inglés', ({ assert }) => {
    assert.equal(REPORT_LOCALE, 'es')
    assert.equal(reportI18n().locale, 'es')
  })
})

test.group('Sello de generación de los reportes', () => {
  test('lleva la fecha y el desfase de la zona, no una etiqueta fija', ({ assert }) => {
    const value = DateTime.fromISO('2026-09-24T14:05:00Z').setZone('America/Mexico_City')
    assert.equal(formatReportGeneratedAt(value), '24/09/2026 08:05 (GMT-6)')
  })
})
