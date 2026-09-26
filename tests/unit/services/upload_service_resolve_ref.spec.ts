import { test } from '@japa/runner'
import env from '#start/env'
import UploadService from '#services/upload_service'

/**
 * `resolveS3Ref` es el traductor entre lo que hay guardado en la base de datos
 * y el par bucket+key que entiende el SDK. Convive con tres generaciones de
 * valores: URL pública de Spaces (filas históricas), URL de MinIO (desarrollo)
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

  test('URL virtual-hosted del bucket propio: el bucket sale del host', ({ assert }) => {
    const ref = service.resolveS3Ref(
      `https://${bucket}.sfo3.digitaloceanspaces.com/valanserh/files/foto.jpg`
    )

    assert.deepEqual(ref, { bucket, key: 'valanserh/files/foto.jpg' })
  })

  test('URL virtual-hosted de un bucket AJENO se resuelve a ese bucket, no al configurado', ({
    assert,
  }) => {
    // Regresión: comparar la primera etiqueta contra AWS_BUCKET rompía las
    // filas históricas, que viven en otro bucket. `sae-assets` es el bucket,
    // `sae-rh-system/...` es la key, no al reves.
    const ref = service.resolveS3Ref(
      'https://sae-assets.sfo3.digitaloceanspaces.com/sae-rh-system/files/foto.jpg'
    )

    assert.deepEqual(ref, { bucket: 'sae-assets', key: 'sae-rh-system/files/foto.jpg' })
  })

  test('una URL que NO es del almacenamiento no es una referencia S3', ({ assert }) => {
    // La foto que pública el checador en su propio servidor se troceaba como si
    // fuera una key del bucket, dejando sin foto al empleado sincronizado.
    assert.isNull(service.resolveS3Ref('http://201.150.46.146:81/photos/E123.jpg'))
    assert.isNull(service.resolveS3Ref('https://evil.example.com/valanserh/files/foto.jpg'))
  })

  test('URL del endpoint configurado (MinIO con puerto): se lee como path-style', ({ assert }) => {
    // Un host con puerto tiene más etiquetas que un dominio de Spaces, así que
    // contar etiquetas sin mirar el dominio lo confundia con virtual-hosted.
    const endpoint = env.get('AWS_ENDPOINT').replace(/\/+$/, '')
    const ref = service.resolveS3Ref(`${endpoint}/${bucket}/valanserh/files/foto.jpg`)

    assert.deepEqual(ref, { bucket, key: 'valanserh/files/foto.jpg' })
  })

  test('Key directa generada por fileUpload: se devuelve intacta', ({ assert }) => {
    const rootPath = env.get('AWS_ROOT_PATH')
    const keyReal = `${rootPath}/employees/abc-123.jpg`
    const ref = service.resolveS3Ref(keyReal)

    assert.deepEqual(ref, { bucket, key: keyReal })
  })

  test('cuando el bucket coincide con el prefijo raiz NO se recorta la key', ({ assert }) => {
    // Regresión: con AWS_BUCKET === AWS_ROOT_PATH la heurística de "prefijo de
    // bucket" recortaba el primer segmento de toda key nueva y apuntaba a un
    // objeto inexistente, rompiendo borrado y lectura en silencio.
    const rootPath = env.get('AWS_ROOT_PATH')
    const ref = service.resolveS3Ref(`${rootPath}/files/foto.jpg`)

    assert.equal(ref?.key, `${rootPath}/files/foto.jpg`)
  })

  test('ante la ambiguedad bucket/prefijo gana la lectura como key directa', ({ assert }) => {
    // `bucket/loQueSea` es indistinguible de una key con el bucket de prefijo.
    // La precedencia es deliberada: si el path empieza por el prefijo raiz se
    // trata como key nuestra y no se recorta, porque recortar de más apunta a
    // un objeto inexistente y rompe borrado y lectura en silencio, mientras que
    // recortar de menos solo falla si de verdad venía con prefijo de bucket.
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
