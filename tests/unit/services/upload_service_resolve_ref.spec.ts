import { test } from '@japa/runner'
import env from '#start/env'
import UploadService from '#services/upload_service'

/**
 * `resolveS3Ref` es el traductor entre lo que hay guardado en la base de datos
 * y el par bucket+key que entiende el SDK. Convive con tres generaciones de
 * valores: URL publica de Spaces (filas historicas), URL de MinIO (desarrollo)
 * y Key directa (todo lo subido desde el endurecimiento).
 */
test.group('UploadService.resolveS3Ref', () => {
  const service = new UploadService()
  const bucket = env.get('AWS_BUCKET')

  test('URL path-style de Spaces: extrae bucket y key de la ruta', ({ assert }) => {
    const ref = service.resolveS3Ref(
      'https://sfo3.digitaloceanspaces.com/mi-bucket/valanserh/files/foto.jpg'
    )

    assert.deepEqual(ref, { bucket: 'mi-bucket', key: 'valanserh/files/foto.jpg' })
  })

  test('URL virtual-hosted: el bucket sale del host cuando coincide con el configurado', ({
    assert,
  }) => {
    const ref = service.resolveS3Ref(
      `https://${bucket}.sfo3.digitaloceanspaces.com/valanserh/files/foto.jpg`
    )

    assert.deepEqual(ref, { bucket, key: 'valanserh/files/foto.jpg' })
  })

  test('URL de MinIO con puerto: se lee como path-style, no como virtual-hosted', ({ assert }) => {
    const ref = service.resolveS3Ref(`http://127.0.0.1:9000/${bucket}/valanserh/files/foto.jpg`)

    assert.deepEqual(ref, { bucket, key: 'valanserh/files/foto.jpg' })
  })

  test('Key directa generada por fileUpload: se devuelve intacta', ({ assert }) => {
    const rootPath = env.get('AWS_ROOT_PATH')
    const keyReal = `${rootPath}/employees/abc-123.jpg`
    const ref = service.resolveS3Ref(keyReal)

    assert.deepEqual(ref, { bucket, key: keyReal })
  })

  test('cuando el bucket coincide con el prefijo raiz NO se recorta la key', ({ assert }) => {
    // Regresion: con AWS_BUCKET === AWS_ROOT_PATH la heuristica de "prefijo de
    // bucket" recortaba el primer segmento de toda key nueva y apuntaba a un
    // objeto inexistente, rompiendo borrado y lectura en silencio.
    const rootPath = env.get('AWS_ROOT_PATH')
    const ref = service.resolveS3Ref(`${rootPath}/files/foto.jpg`)

    assert.equal(ref?.key, `${rootPath}/files/foto.jpg`)
  })

  test('ante la ambiguedad bucket/prefijo gana la lectura como key directa', ({ assert }) => {
    // `bucket/loQueSea` es indistinguible de una key con el bucket de prefijo.
    // La precedencia es deliberada: si el path empieza por el prefijo raiz se
    // trata como key nuestra y no se recorta, porque recortar de mas apunta a
    // un objeto inexistente y rompe borrado y lectura en silencio, mientras que
    // recortar de menos solo falla si de verdad venia con prefijo de bucket.
    const rootPath = env.get('AWS_ROOT_PATH')
    const conPrefijoRaiz = `${rootPath}/otra-carpeta/foto.jpg`

    assert.equal(service.resolveS3Ref(conPrefijoRaiz)?.key, conPrefijoRaiz)

    // Un path que empieza por el bucket pero NO por el prefijo raiz si se
    // recorta (caso real cuando bucket y prefijo raiz no coinciden).
    if (bucket !== rootPath) {
      const ref = service.resolveS3Ref(`${bucket}/otra-app/files/foto.jpg`)
      assert.deepEqual(ref, { bucket, key: 'otra-app/files/foto.jpg' })
    }
  })

  test('la key llega decodificada aunque la URL venga percent-encoded', ({ assert }) => {
    const ref = service.resolveS3Ref(
      'https://sfo3.digitaloceanspaces.com/mi-bucket/valanserh/files/acta%20final.pdf'
    )

    assert.equal(ref?.key, 'valanserh/files/acta final.pdf')
  })

  test('cadena vacia y URL sin key devuelven null', ({ assert }) => {
    assert.isNull(service.resolveS3Ref(''))
    assert.isNull(service.resolveS3Ref('https://sfo3.digitaloceanspaces.com/solo-bucket'))
  })
})
