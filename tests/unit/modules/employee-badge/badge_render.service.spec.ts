import { writeFileSync } from 'node:fs'
import { test } from '@japa/runner'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import BadgeRenderService, {
  type BadgeRenderContext,
} from '#modules/employee-badge/badge_render.service'

/** Contexto base sin foto: el render no toca bucket ni red. */
const BASE_CONTEXT: BadgeRenderContext = {
  employeeId: 1,
  nombreCompleto: 'María Guadalupe Hernández López',
  fotoUrl: null,
  empresa: 'Servicios Especializados del Norte SA de CV',
  puesto: 'Supervisor de limpieza',
  folioRepse: 'AR12345/2024',
  folioVigente: true,
  urlVerificacion: 'https://app.example.com/gafete/verificar/abc123',
}

/** Lee el color RGB de un pixel del PNG renderizado. */
async function pixelAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(x, y, 1, 1).data
  return [data[0], data[1], data[2]]
}

test.group('BadgeRenderService - formato neutral', () => {
  test('el PNG conserva el tamaño CR80 @300 dpi', async ({ assert }) => {
    const png = await new BadgeRenderService().renderBadgePng(BASE_CONTEXT)
    const image = await loadImage(png)
    assert.equal(image.width, 1011)
    assert.equal(image.height, 638)

    // Muestra opcional para revisión visual manual.
    const sampleOut = process.env.BADGE_SAMPLE_OUT
    if (sampleOut) writeFileSync(sampleOut, png)
  })

  test('la franja con folio es negra (sin color de marca)', async ({ assert }) => {
    const png = await new BadgeRenderService().renderBadgePng(BASE_CONTEXT)
    // Esquina derecha de la franja: lejos del rótulo.
    assert.deepEqual(await pixelAt(png, 1000, 10), [0, 0, 0])
  })

  test('la franja interna es gris claro para distinguirse en B/N', async ({ assert }) => {
    const png = await new BadgeRenderService().renderBadgePng({
      ...BASE_CONTEXT,
      folioRepse: null,
      folioVigente: null,
    })
    assert.deepEqual(await pixelAt(png, 1000, 10), [0xd9, 0xd9, 0xd9])
  })
})
