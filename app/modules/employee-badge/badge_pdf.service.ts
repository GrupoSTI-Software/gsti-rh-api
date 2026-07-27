import PDFDocument from 'pdfkit'
import BadgeRenderService, { type BadgeRenderContext } from './badge_render.service.js'

/** Tamaño credencial CR80 (85.6 × 53.98 mm) en puntos, apaisado. */
const CR80_SIZE: [number, number] = [242.65, 153.07]

export type BadgePdfInput = BadgeRenderContext

/**
 * Genera el PDF CR80 del gafete embebiendo el PNG master (§9.3 USRH1784690015155).
 * Firma pública intacta; el layout visual vive en `badge_render.service.ts`.
 * Nunca persiste en disco ni en S3 (§13.6 del spec).
 */
export default class BadgePdfService {
  async buildBadgePdf(input: BadgePdfInput): Promise<Buffer> {
    const renderService = new BadgeRenderService()
    const pngBuffer = await renderService.renderBadgePng(input)

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: CR80_SIZE,
        margin: 0,
        info: {
          Title: `Gafete del empleado #${input.employeeId}`,
          Creator: 'Valanserh',
          Producer: 'PDFKit',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      doc.image(pngBuffer, 0, 0, { width: CR80_SIZE[0], height: CR80_SIZE[1] })
      doc.end()
    })
  }
}
