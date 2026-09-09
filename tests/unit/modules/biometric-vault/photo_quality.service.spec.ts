import { test } from '@japa/runner'
import sharp from 'sharp'
import PhotoQualityService from '#modules/biometric-vault/photo/photo_quality.service'

/** Imagen lisa del color dado, para controlar el brillo sin depender de nada. */
async function flatImage(gray: number): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 800, channels: 3, background: { r: gray, g: gray, b: gray } },
  })
    .jpeg()
    .toBuffer()
}

function detectorOf(
  faces: number,
  box = { x: 100, y: 100, width: 300, height: 400 }
): { detectAllFacesIn(): Promise<{ faces: number; boxes: typeof box[]; width: number; height: number }> } {
  return {
    async detectAllFacesIn() {
      return {
        faces,
        boxes: Array.from({ length: faces }, () => box),
        width: 640,
        height: 800,
      }
    },
  }
}

test.group('Calidad de la foto para el checador', () => {
  test('una foto con un rostro bien encuadrado y bien iluminada pasa', async ({ assert }) => {
    const service = new PhotoQualityService(detectorOf(1))
    const report = await service.evaluate(await flatImage(128))
    assert.equal(report.verdict, 'ok')
    assert.equal(report.faces, 1)
  })

  test('sin rostro no sirve', async ({ assert }) => {
    const service = new PhotoQualityService(detectorOf(0))
    const report = await service.evaluate(await flatImage(128))
    assert.equal(report.verdict, 'no_face')
  })

  /**
   * Es la razon de usar `detectAllFaces` y no `detectSingleFace`: el detector
   * de una sola cara devuelve la mejor y calla que habia otra, y el equipo
   * acabaria reconociendo a quien pasaba por detras.
   */
  test('con dos rostros no se sabe cual es el colaborador', async ({ assert }) => {
    const service = new PhotoQualityService(detectorOf(2))
    const report = await service.evaluate(await flatImage(128))
    assert.equal(report.verdict, 'many_faces')
  })

  test('un rostro diminuto en el cuadro no sirve de referencia', async ({ assert }) => {
    const service = new PhotoQualityService(detectorOf(1, { x: 0, y: 0, width: 40, height: 40 }))
    const report = await service.evaluate(await flatImage(128))
    assert.equal(report.verdict, 'face_too_small')
    assert.isBelow(report.faceAreaRatio ?? 1, 0.1)
  })

  test('una foto muy oscura o muy quemada se rechaza', async ({ assert }) => {
    const service = new PhotoQualityService(detectorOf(1))
    const oscura = await service.evaluate(await flatImage(5))
    const quemada = await service.evaluate(await flatImage(250))
    assert.equal(oscura.verdict, 'brightness')
    assert.equal(quemada.verdict, 'brightness')
  })

  /**
   * "No se pudo evaluar" no es "la foto no sirve": si el evaluador revienta,
   * la excepcion sube para que se responda 500 y nadie tenga que volver a
   * fotografiar a una persona por un problema del servidor.
   */
  test('si el detector revienta, la excepcion sube en vez de rechazar la foto', async ({
    assert,
  }) => {
    const roto = {
      async detectAllFacesIn(): Promise<never> {
        throw new Error('modelos no cargados')
      },
    }
    const service = new PhotoQualityService(roto)
    await assert.rejects(() => service.evaluate(Buffer.from([0xff, 0xd8])), 'modelos no cargados')
  })
})
