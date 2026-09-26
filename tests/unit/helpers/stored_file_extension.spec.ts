import { test } from '@japa/runner'
import { resolveStoredFileExtension } from '#helpers/stored_file_extension'

test.group('resolveStoredFileExtension', () => {
  test('toma la extensión de la key de almacenamiento primero', ({ assert }) => {
    assert.equal(
      resolveStoredFileExtension({
        storedPath: 'app/files/contratos/abc123.PDF',
        fileName: 'contrato.docx',
        contentType: 'image/png',
      }),
      'pdf'
    )
  })

  test('cae al nombre original y luego al MIME', ({ assert }) => {
    assert.equal(
      resolveStoredFileExtension({ storedPath: 'app/files/sin-extension', fileName: 'recibo.jpg' }),
      'jpg'
    )
    assert.equal(
      resolveStoredFileExtension({ storedPath: 'app/files/sin-extension', contentType: 'image/png; charset=binary' }),
      'png'
    )
  })

  test('sin nada reconocible usa bin', ({ assert }) => {
    assert.equal(resolveStoredFileExtension({ contentType: 'application/octet-stream' }), 'bin')
    assert.equal(resolveStoredFileExtension({ storedPath: 'carpeta.v2/archivo' }), 'bin')
  })
})
