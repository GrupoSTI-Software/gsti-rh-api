import { test } from '@japa/runner'
import {
  extractPhotoToken,
  generatePhotoToken,
  hashPhotoToken,
  isTokenShaped,
  photoTokenHashMatches,
} from '#modules/biometric-vault/photo/photo_token'

test.group('Token de descarga de foto', () => {
  test('el token es base64url de 43 caracteres y cada uno es distinto', ({ assert }) => {
    const a = generatePhotoToken()
    const b = generatePhotoToken()
    assert.isTrue(isTokenShaped(a))
    assert.lengthOf(a, 43)
    assert.notEqual(a, b)
  })

  test('el hash es estable y no revela el token', ({ assert }) => {
    const token = generatePhotoToken()
    assert.equal(hashPhotoToken(token), hashPhotoToken(token))
    assert.notInclude(hashPhotoToken(token), token)
    assert.lengthOf(hashPhotoToken(token), 64)
  })

  test('dos hashes iguales coinciden y dos distintos no', ({ assert }) => {
    const uno = hashPhotoToken('a')
    const otro = hashPhotoToken('b')
    assert.isTrue(photoTokenHashMatches(uno, uno))
    assert.isFalse(photoTokenHashMatches(uno, otro))
    assert.isFalse(photoTokenHashMatches(uno, 'corto'))
  })

  test('saca el token de la forma medida en hardware', ({ assert }) => {
    const token = generatePhotoToken()
    assert.equal(extractPhotoToken(`/iclock/doc/biophoto/${token}/9998.jpg`), token)
    assert.equal(extractPhotoToken(`/iclock/doc/biophoto/${token}/9998.jpg?SN=ABC`), token)
  })

  test('y de la forma de reserva, con el token como nombre del archivo', ({ assert }) => {
    const token = generatePhotoToken()
    assert.equal(extractPhotoToken(`/iclock/doc/biophoto/${token}.jpg`), token)
  })

  test('una ruta sin token con forma valida no devuelve nada', ({ assert }) => {
    assert.isNull(extractPhotoToken('/iclock/doc/biophoto/1/9998.jpg'))
    assert.isNull(extractPhotoToken('/iclock/doc/biophoto/'))
    assert.isNull(extractPhotoToken(''))
    // Un token de largo equivocado no pasa: probar rutas no debe costar consultas.
    assert.isNull(extractPhotoToken('/iclock/doc/biophoto/abc/9998.jpg'))
  })
})
