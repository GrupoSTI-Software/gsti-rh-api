import { test } from '@japa/runner'
import { REPORT_LOCALE, reportI18n } from '#helpers/report_locale'

test.group('Idioma de los reportes', () => {
  test('el traductor de reportes es español aunque la petición llegue en inglés', ({ assert }) => {
    assert.equal(REPORT_LOCALE, 'es')
    assert.equal(reportI18n().locale, 'es')
  })
})
