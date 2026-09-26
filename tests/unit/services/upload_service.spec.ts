import { test } from '@japa/runner'
import UploadService from '#services/upload_service'

/**
 * Tests unitarios del servicio de almacenamiento (S3 / DigitalOcean Spaces).
 *
 * Sin red real: solo validamos los early-returns del método getObjectStream
 * (clave vacía o ausencia de configuración) que no requieren llegar al SDK.
 * Las rutas que tocan AWS se cubren con el smoke test manual contra el
 * servidor desplegado.
 */
test.group('UploadService — getObjectStream', () => {
  test('devuelve null cuando la key es cadena vacía', async ({ assert }) => {
    const service = new UploadService()
    const result = await service.getObjectStream('')
    assert.isNull(result)
  })

  test('devuelve null cuando la key es undefined casteado a string', async ({ assert }) => {
    const service = new UploadService()
    // @ts-expect-error - probando contrato defensivo del método
    const result = await service.getObjectStream(undefined)
    assert.isNull(result)
  })
})
