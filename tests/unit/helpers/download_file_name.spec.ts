import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  buildDownloadFileName,
  contentDisposition,
  formatDownloadFileDate,
  slugifyFileNamePart,
} from '#helpers/download_file_name'

/**
 * Convención única de nombres de archivos descargables: minúsculas, en
 * español, sin acentos, solo guiones y fechas ISO en zona de negocio.
 */

test.group('download_file_name', () => {
  test('sanea acentos, ñ, espacios y caracteres inseguros', ({ assert }) => {
    assert.equal(slugifyFileNamePart('Gerente de Operaciones / Norte'), 'gerente-de-operaciones-norte')
    assert.equal(slugifyFileNamePart('Cumpleaños'), 'cumpleanos')
    assert.equal(slugifyFileNamePart('  Nómina: *?  '), 'nomina')
  })

  test('une segmentos con guiones y omite los vacíos', ({ assert }) => {
    assert.equal(
      buildDownloadFileName(['reporte asistencia', null, '2026-09-01', undefined, '', '2026-09-15'], 'xlsx'),
      'reporte-asistencia-2026-09-01-2026-09-15.xlsx'
    )
    assert.equal(buildDownloadFileName(['resumen vacaciones', 2026], '.XLSX'), 'resumen-vacaciones-2026.xlsx')
  })

  test('sin segmentos útiles cae a un nombre genérico', ({ assert }) => {
    assert.equal(buildDownloadFileName([null, '***'], 'pdf'), 'descarga.pdf')
  })

  test('una fecha civil pura no se corre de día', ({ assert }) => {
    assert.equal(formatDownloadFileDate('2026-09-01'), '2026-09-01')
  })

  test('un instante UTC nocturno cae en el día de la zona de negocio', ({ assert }) => {
    // 2026-09-23 03:00 UTC es 2026-09-22 21:00 en CDMX.
    assert.equal(formatDownloadFileDate('2026-09-23T03:00:00.000Z'), '2026-09-22')
    assert.equal(
      formatDownloadFileDate(DateTime.fromISO('2026-09-23T03:00:00.000Z', { zone: 'utc' })),
      '2026-09-22'
    )
  })

  test('Content-Disposition lleva filename ASCII y filename* RFC 5987', ({ assert }) => {
    assert.equal(
      contentDisposition('reporte-quejas-2026-09-01-2026-09-30.pdf'),
      'attachment; filename="reporte-quejas-2026-09-01-2026-09-30.pdf"; filename*=UTF-8\'\'reporte-quejas-2026-09-01-2026-09-30.pdf'
    )
    assert.match(contentDisposition('escrito.pdf', 'inline'), /^inline; /)
  })
})
