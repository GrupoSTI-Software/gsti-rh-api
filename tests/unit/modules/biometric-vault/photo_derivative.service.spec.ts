import { test } from '@japa/runner'
import sharp from 'sharp'
import PhotoDerivativeService from '#modules/biometric-vault/photo/photo_derivative.service'
import PhotoQualityService from '#modules/biometric-vault/photo/photo_quality.service'
import type UploadService from '#services/upload_service'

/** Foto con ruido: una imagen lisa comprime a menos de lo que el aparato acepta. */
async function noisyPhoto(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i += 1) raw[i] = 64 + Math.floor(Math.random() * 128)
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer()
}

/** Un rostro del ancho dado, medido sobre el derivado de 640 x 800. */
function qualityWithFace(width: number): PhotoQualityService {
  return new PhotoQualityService({
    async detectAllFacesIn() {
      return {
        faces: 1,
        boxes: [{ x: 100, y: 100, width, height: Math.round(width * 1.3) }],
        width: 640,
        height: 800,
      }
    },
  })
}

const noUploads = {} as UploadService

test.group('Derivado de la foto para el checador', () => {
  test('un original de 512 x 640 alcanza: es lo que ya funciono en el V5L', async ({ assert }) => {
    const service = new PhotoDerivativeService(qualityWithFace(300), noUploads)
    const outcome = await service.buildFromBuffer(await noisyPhoto(512, 640))
    assert.isTrue(outcome.ok)
    if (!outcome.ok) return
    const meta = await sharp(outcome.buffer).metadata()
    assert.equal(meta.width, 640)
    assert.equal(meta.height, 800)
    assert.equal(meta.format, 'jpeg')
  })

  test('un original mas chico se rechaza por resolucion y dice cuanto mide', async ({ assert }) => {
    const service = new PhotoDerivativeService(qualityWithFace(300), noUploads)
    const outcome = await service.buildFromBuffer(await noisyPhoto(480, 480))
    assert.isFalse(outcome.ok)
    if (outcome.ok) return
    assert.equal(outcome.verdict, 'resolution')
    assert.include(outcome.detail, '480 por 480')
  })

  /**
   * Una cara de 200 px en el derivado pasa el 10 % del cuadro, pero desde un
   * original de 512 x 640 (escala 1.25) son 160 px de cara real: no alcanza.
   * Desde 1024 x 1280 (escala 0.625) la misma caja son 320 px y si.
   */
  test('la cara se juzga en la escala del original', async ({ assert }) => {
    const deGrande = await new PhotoDerivativeService(qualityWithFace(200), noUploads).buildFromBuffer(
      await noisyPhoto(1024, 1280)
    )
    const deChica = await new PhotoDerivativeService(qualityWithFace(200), noUploads).buildFromBuffer(
      await noisyPhoto(512, 640)
    )
    assert.isTrue(deGrande.ok)
    assert.isFalse(deChica.ok)
    if (!deChica.ok) assert.equal(deChica.verdict, 'face_too_small')
  })
})
