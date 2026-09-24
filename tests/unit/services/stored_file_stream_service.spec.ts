import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import StoredFileStreamService from '#services/stored_file_stream_service'
import type UploadService from '#services/upload_service'

/** Respuesta falsa: solo registra cabeceras, estado y cuerpo. */
function fakeResponse() {
  const headers: Record<string, string> = {}
  return {
    headers,
    response: {
      header(name: string, value: string) {
        headers[name.toLowerCase()] = value
      },
      status() {},
      stream() {},
      send() {},
    },
  }
}

const fakeUpload = {
  async streamStoredFile() {
    return { stream: Readable.from([]), contentType: 'image/jpeg', contentLength: 3 }
  },
} as unknown as UploadService

test.group('StoredFileStreamService - caché', () => {
  test('la foto del empleado se sirve sin caché del navegador', async ({ assert }) => {
    const { headers, response } = fakeResponse()

    await new StoredFileStreamService(fakeUpload).streamEmployeePhotoInto(
      { response } as never,
      'employees/1/photo.jpg'
    )

    assert.equal(headers['cache-control'], 'private, no-store')
  })

  test('los demás archivos conservan su caché corta', async ({ assert }) => {
    const { headers, response } = fakeResponse()

    await new StoredFileStreamService(fakeUpload).streamInto(
      { response } as never,
      'notices/1/file.pdf'
    )

    assert.equal(headers['cache-control'], 'private, max-age=300')
  })
})
