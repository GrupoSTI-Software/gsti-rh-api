import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

/** Ruta relativa a `resources/fonts/` desde este archivo de servicio (Mulish, DS Valanserh). */
const FONTS_DIR_REL = ['..', '..', '..', 'resources', 'fonts'] as const

/** Paleta de marca — franja superior y textos del gafete. */
const BRAND_COLORS = {
  primary: '#2B3A8F',
  internalHeader: '#1A1A1A',
  text: '#1F2937',
  textMuted: '#6B7280',
  textLight: '#FFFFFF',
  vigente: '#1E8E5A',
  vigenteBg: '#DDF5E8',
  noVigente: '#C0392B',
  noVigenteBg: '#FCE8E6',
  placeholderBg: '#F3F4F6',
  placeholderStripe: '#E5E7EB',
  placeholderFg: '#9CA3AF',
} as const

/** Radio de esquinas de la foto del trabajador (espejo diseño BO). */
const PHOTO_CORNER_RADIUS = 7

/** Tamaño credencial CR80 (85.6 × 53.98 mm) en puntos, apaisado. */
const CR80_SIZE: [number, number] = [242.65, 153.07]

export interface BadgePdfInput {
  employeeId: number
  nombreCompleto: string
  fotoUrl: string | null
  empresa: string
  puesto: string | null
  logoUrl: string | null
  folioRepse: string | null
  folioVigente: boolean | null
  urlVerificacion: string
}

/**
 * Genera el PDF CR80 del gafete en memoria (Buffer). Nunca persiste en disco
 * ni en S3 (§13.6 del spec). Imágenes (foto, logo) tolerantes a falla —
 * espejo `position_service.ts:936-944`. Fuentes Mulish con fallback Helvetica
 * — espejo `traumatic_event_report_document_service.ts:724`.
 */
export default class BadgePdfService {
  async buildBadgePdf(input: BadgePdfInput): Promise<Buffer> {
    const [fotoBuffer, logoBuffer, qrBuffer] = await Promise.all([
      this.fetchImageTolerant(input.fotoUrl),
      this.fetchImageTolerant(input.logoUrl),
      QRCode.toBuffer(input.urlVerificacion, { margin: 0, width: 256 }),
    ])

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

      this.registerFonts(doc)

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      this.render(doc, input, { fotoBuffer, logoBuffer, qrBuffer })

      doc.end()
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private render(
    doc: PDFKit.PDFDocument,
    input: BadgePdfInput,
    images: { fotoBuffer: Buffer | null; logoBuffer: Buffer | null; qrBuffer: Buffer }
  ) {
    const [pageW, pageH] = CR80_SIZE
    const hasFolio = !!input.folioRepse

    this.renderTopStrip(doc, pageW, images.logoBuffer, hasFolio)
    this.renderPhoto(doc, input.nombreCompleto, images.fotoBuffer)
    this.renderNameCompanyAndPosition(doc, input, hasFolio)
    if (hasFolio) {
      this.renderFolioBlock(doc, input)
    } else {
      this.renderCollaboratorBadge(doc, pageW, pageH)
    }
    this.renderQr(doc, images.qrBuffer, pageW)
    this.renderFooter(doc, pageW, pageH, input.urlVerificacion)
  }

  private renderTopStrip(
    doc: PDFKit.PDFDocument,
    pageW: number,
    logoBuffer: Buffer | null,
    hasFolio: boolean
  ) {
    const stripH = 22
    const stripColor = hasFolio ? BRAND_COLORS.primary : BRAND_COLORS.internalHeader
    doc.save()
    doc.rect(0, 0, pageW, stripH).fill(stripColor)
    doc.restore()

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 8, 3, { fit: [60, 16] })
      } catch {
        // Logo corrupto/formato no soportado: se omite, no bloquea el gafete.
      }
    }

    doc
      .font('Mulish-Bold')
      .fontSize(6.5)
      .fillColor(BRAND_COLORS.textLight)
      .text(hasFolio ? 'PERSONAL ESPECIALIZADO' : 'IDENTIFICACIÓN INTERNA', 0, 7, {
        width: pageW - 8,
        align: 'right',
      })
  }

  private renderPhoto(doc: PDFKit.PDFDocument, _nombreCompleto: string, fotoBuffer: Buffer | null) {
    const x = 10
    const y = 32
    const w = 58
    const h = 72
    const r = PHOTO_CORNER_RADIUS

    if (fotoBuffer) {
      try {
        doc.save()
        doc.roundedRect(x, y, w, h, r).clip()
        doc.image(fotoBuffer, x, y, { width: w, height: h })
        doc.restore()
        return
      } catch {
        // Foto corrupta/no soportada: cae al marcador de posición.
      }
    }

    this.renderMissingPhotoPlaceholder(doc, x, y, w, h, r)
  }

  /** Marcador sin foto — rayas diagonales + leyenda (espejo BO identificación interna). */
  private renderMissingPhotoPlaceholder(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    doc.save()
    doc.roundedRect(x, y, w, h, r).clip()
    doc.rect(x, y, w, h).fill(BRAND_COLORS.placeholderBg)

    doc.save()
    doc.lineWidth(0.45).strokeColor(BRAND_COLORS.placeholderStripe)
    for (let offset = -h; offset < w + h; offset += 7) {
      doc.moveTo(x + offset, y).lineTo(x + offset - h, y + h).stroke()
    }
    doc.restore()

    doc
      .font('Mulish')
      .fontSize(4.5)
      .fillColor(BRAND_COLORS.placeholderFg)
      .text('Sin foto cargada', x, y + h / 2 - 5, { width: w, align: 'center', lineGap: 0.5 })
    doc.restore()
  }

  private renderNameCompanyAndPosition(
    doc: PDFKit.PDFDocument,
    input: BadgePdfInput,
    hasFolio: boolean
  ) {
    const x = 76
    const width = 96
    const nameLineGap = 0.5
    const hasPuesto = !!input.puesto?.trim()
    // Con folio el bloque queda más arriba (deja espacio al folio abajo);
    // sin folio se centra verticalmente (regla 12: layout compactado).
    const y = hasFolio ? 34 : hasPuesto ? 46 : 52

    doc.font('Mulish-Bold').fontSize(9).fillColor(BRAND_COLORS.text)
    // Sin `height`: PDFKit recorta si el texto necesita más pt que el tope fijo
    // (p. ej. "Luis Miguel Rodríguez Veltrán" ≈ 22.4 pt en 2 líneas).
    doc.text(input.nombreCompleto, x, y, { width, lineGap: nameLineGap })

    const empresaY = doc.y + 3
    doc.font('Mulish').fontSize(6.5).fillColor(BRAND_COLORS.primary)
    doc.text(input.empresa, x, empresaY, { width, lineGap: 0.5 })

    if (hasPuesto) {
      const empresaHeight = doc.heightOfString(input.empresa, { width, lineGap: 0.5 })
      doc
        .font('Mulish')
        .fontSize(6)
        .fillColor(BRAND_COLORS.textMuted)
        .text(input.puesto!, x, empresaY + empresaHeight + 2, { width, lineGap: 0.5 })
    }
  }

  private renderFolioBlock(doc: PDFKit.PDFDocument, input: BadgePdfInput) {
    const x = 76
    const width = 96
    const y = 92

    doc
      .font('Mulish')
      .fontSize(5.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text('FOLIO REPSE', x, y)

    doc
      .font('Mulish-Bold')
      .fontSize(6.5)
      .fillColor(BRAND_COLORS.text)
      .text(input.folioRepse!, x, y + 7, { width })

    this.renderStatusBadge(doc, x, y + 17, input.folioVigente === true)
  }

  /** Gafete sin REPSE: pill centrado "COLABORADOR ACTIVO" (regla 12 / mockup BO). */
  private renderCollaboratorBadge(doc: PDFKit.PDFDocument, pageW: number, pageH: number) {
    const label = 'COLABORADOR ACTIVO'
    const fontSize = 5.5
    const dotRadius = 1.5
    const paddingX = 4
    const gap = 2.5

    doc.font('Mulish-Bold').fontSize(fontSize)
    const textWidth = doc.widthOfString(label)
    const badgeW = paddingX * 2 + dotRadius * 2 + gap + textWidth
    const x = (pageW - badgeW) / 2
    const y = pageH - 24

    this.renderStatusBadge(doc, x, y, true, label)
  }

  /** Pill de estado — REPSE (VIGENTE/NO VIGENTE) o interno (COLABORADOR ACTIVO). */
  private renderStatusBadge(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    vigente: boolean,
    label?: string
  ) {
    const text = label ?? (vigente ? 'VIGENTE' : 'NO VIGENTE')
    const textColor = vigente ? BRAND_COLORS.vigente : BRAND_COLORS.noVigente
    const bgColor = vigente ? BRAND_COLORS.vigenteBg : BRAND_COLORS.noVigenteBg
    const fontSize = 5.5
    const dotRadius = 1.5
    const paddingX = 4
    const gap = 2.5
    const badgeH = 9

    doc.font('Mulish-Bold').fontSize(fontSize)
    const textWidth = doc.widthOfString(text)
    const badgeW = paddingX * 2 + dotRadius * 2 + gap + textWidth

    doc.save()
    doc.roundedRect(x, y, badgeW, badgeH, badgeH / 2).fill(bgColor)
    doc.restore()

    const dotCx = x + paddingX + dotRadius
    const dotCy = y + badgeH / 2
    doc.save()
    doc.circle(dotCx, dotCy, dotRadius).fill(textColor)
    doc.restore()

    doc
      .font('Mulish-Bold')
      .fontSize(fontSize)
      .fillColor(textColor)
      .text(text, x + paddingX + dotRadius * 2 + gap, y + 1.8, { lineBreak: false })
  }

  private renderQr(doc: PDFKit.PDFDocument, qrBuffer: Buffer, pageW: number) {
    const size = 52
    const x = pageW - size - 8
    const y = 36

    doc.image(qrBuffer, x, y, { width: size, height: size })
    doc
      .font('Mulish')
      .fontSize(4.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text('Escanea para verificar', x - 10, y + size + 3, { width: size + 20, align: 'center' })
  }

  private renderFooter(doc: PDFKit.PDFDocument, pageW: number, pageH: number, urlVerificacion: string) {
    const footerText = this.formatVerificationFooter(urlVerificacion)
    doc
      .font('Mulish')
      .fontSize(4)
      .fillColor(BRAND_COLORS.textMuted)
      .text(footerText, 8, pageH - 9, { width: pageW - 16, align: 'center', ellipsis: true })
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatVerificationFooter(urlVerificacion: string): string {
    try {
      const parsed = new URL(urlVerificacion)
      const pathBase = parsed.pathname.replace(/\/[^/]+$/, '') || parsed.pathname
      return `Escanea el QR · ${parsed.host}${pathBase}`
    } catch {
      return `Escanea el QR · ${urlVerificacion.replace(/^https?:\/\//, '')}`
    }
  }

  /** Descarga tolerante — espejo `position_service.ts:936-944`: nunca bloquea el gafete. */
  private async fetchImageTolerant(url: string | null): Promise<Buffer | null> {
    if (!url) return null
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 })
      return Buffer.from(res.data)
    } catch {
      return null
    }
  }

  /** Registra Mulish con fallback a Helvetica — espejo `traumatic_event_report_document_service.ts:724`. */
  private registerFonts(doc: PDFKit.PDFDocument) {
    try {
      const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...FONTS_DIR_REL)
      doc.registerFont('Mulish', path.join(baseDir, 'Mulish-Regular.ttf'))
      doc.registerFont('Mulish-Bold', path.join(baseDir, 'Mulish-Bold.ttf'))
    } catch {
      doc.registerFont('Mulish', 'Helvetica')
      doc.registerFont('Mulish-Bold', 'Helvetica-Bold')
    }
  }
}
