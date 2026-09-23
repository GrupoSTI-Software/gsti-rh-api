import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPORT_NEUTRAL_HEX } from '#constants/report_neutral_theme'
import { readEmployeePhotoBuffer } from '#helpers/employee_photo_source'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import QRCode from 'qrcode'

/** Contexto 2D de `@napi-rs/canvas` (incluye `drawImage` sobre buffers/imágenes). */
type BadgeCanvasContext = NonNullable<ReturnType<ReturnType<typeof createCanvas>['getContext']>>

/**
 * Ruta relativa a `resources/fonts/` desde este archivo de servicio.
 * Se usa Roboto (tipografía neutral empaquetada) en lugar de Mulish (DS Valanserh):
 * el gafete es un descargable y no debe cargar identidad de marca. Se empaqueta
 * el TTF en vez de depender de fuentes del sistema para que el render sea igual
 * en cualquier servidor.
 */
const FONTS_DIR_REL = ['..', '..', '..', 'resources', 'fonts'] as const

/** Ancho del master PNG @300 dpi (CR80 85.6 mm). */
const CANVAS_WIDTH = 1011

/** Alto del master PNG @300 dpi (CR80 53.98 mm). */
const CANVAS_HEIGHT = 638

/** Escala respecto al layout PDFKit en puntos (242.65 × 153.07). */
const SCALE = CANVAS_WIDTH / 242.65

/**
 * Paleta neutral del gafete (decisión de producto 2026-09-22): escala de grises
 * con texto negro, legible al imprimir en blanco y negro. Solo se conservan los
 * colores semánticos de estatus (vigente / no vigente), que no son marca.
 */
const BADGE_COLORS = {
  /** Franja del gafete con folio REPSE: negro con texto blanco. */
  stripFolio: REPORT_NEUTRAL_HEX.text,
  stripFolioText: REPORT_NEUTRAL_HEX.textInverse,
  /** Franja de identificación interna: gris claro con texto negro (distinguible en B/N). */
  stripInternal: REPORT_NEUTRAL_HEX.headerFill,
  stripInternalText: REPORT_NEUTRAL_HEX.text,
  text: REPORT_NEUTRAL_HEX.text,
  textMuted: REPORT_NEUTRAL_HEX.textMuted,
  background: REPORT_NEUTRAL_HEX.background,
  vigente: '#1E8E5A',
  vigenteBg: '#DDF5E8',
  noVigente: '#C0392B',
  noVigenteBg: '#FCE8E6',
  placeholderBg: REPORT_NEUTRAL_HEX.subheaderFill,
  placeholderStripe: REPORT_NEUTRAL_HEX.headerFill,
  placeholderFg: REPORT_NEUTRAL_HEX.textMuted,
} as const

/** Radio de esquinas de la foto del trabajador (espejo diseño BO). */
const PHOTO_CORNER_RADIUS = 7

const FONT_REGULAR = 'BadgeRoboto'
const FONT_BOLD = 'BadgeRoboto-Bold'

let fontsRegistered = false

export interface BadgeRenderContext {
  employeeId: number
  nombreCompleto: string
  /**
   * Lo que guarda `employeePhoto`: key del bucket o URL del servidor de
   * biométricos. No es la URL pública, que es `null` para objetos privados.
   */
  fotoPath: string | null
  empresa: string
  puesto: string | null
  departamento: string | null
  /** Número de nómina del empleado; `null` si no se capturó. */
  numeroNomina: string | null
  folioRepse: string | null
  folioVigente: boolean | null
  urlVerificacion: string
}

/**
 * Render único del gafete: PNG master @300 dpi (1011×638 px) vía `@napi-rs/canvas`.
 * Fuente visual única consumida por E5 (PNG) y por `badge_pdf.service.ts` (embebido).
 * Nunca persiste en disco ni en S3 (§13.6 del spec).
 */
export default class BadgeRenderService {
  async renderBadgePng(input: BadgeRenderContext): Promise<Buffer> {
    this.ensureFontsRegistered()

    const [fotoBuffer, qrBuffer] = await Promise.all([
      this.fetchImageTolerant(input.fotoPath),
      QRCode.toBuffer(input.urlVerificacion, { margin: 0, width: 512 }),
    ])

    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT)
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = BADGE_COLORS.background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const hasFolio = !!input.folioRepse
    const fotoImage = fotoBuffer ? await this.tryLoadImage(fotoBuffer) : null
    const qrImage = await loadImage(qrBuffer)

    this.renderTopStrip(ctx, hasFolio)
    this.renderPhoto(ctx, fotoImage)
    this.renderNameCompanyAndPosition(ctx, input, hasFolio)

    if (hasFolio) {
      this.renderFolioBlock(ctx, input)
    } else {
      this.renderCollaboratorBadge(ctx)
    }

    this.renderQr(ctx, qrImage)
    this.renderPayrollFields(ctx, input)

    return canvas.toBuffer('image/png')
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /**
   * Franja sin logo ni color de marca: solo el rótulo del tipo de gafete, alineado a la izquierda.
   * El tipo (folio REPSE vs interno) se distingue por tono de gris, no por color.
   */
  private renderTopStrip(ctx: BadgeCanvasContext, hasFolio: boolean) {
    const stripH = this.s(22)
    const stripColor = hasFolio ? BADGE_COLORS.stripFolio : BADGE_COLORS.stripInternal
    const stripTextColor = hasFolio ? BADGE_COLORS.stripFolioText : BADGE_COLORS.stripInternalText

    ctx.fillStyle = stripColor
    ctx.fillRect(0, 0, CANVAS_WIDTH, stripH)

    const headerText = hasFolio ? 'PERSONAL ESPECIALIZADO' : 'IDENTIFICACIÓN INTERNA'
    ctx.font = `${this.s(6.5)}px "${FONT_BOLD}"`
    ctx.fillStyle = stripTextColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(headerText, this.s(8), this.s(7) + this.s(6.5))
  }

  private renderPhoto(
    ctx: BadgeCanvasContext,
    fotoImage: Awaited<ReturnType<typeof loadImage>> | null
  ) {
    const x = this.s(10)
    const y = this.s(32)
    const w = this.s(58)
    const h = this.s(72)
    const r = this.s(PHOTO_CORNER_RADIUS)

    ctx.save()
    this.roundedRectPath(ctx, x, y, w, h, r)
    ctx.clip()

    if (fotoImage) {
      ctx.drawImage(fotoImage, x, y, w, h)
      ctx.restore()
      return
    }

    this.renderMissingPhotoPlaceholder(ctx, x, y, w, h)
    ctx.restore()
  }

  private renderMissingPhotoPlaceholder(
    ctx: BadgeCanvasContext,
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    ctx.fillStyle = BADGE_COLORS.placeholderBg
    ctx.fillRect(x, y, w, h)

    ctx.strokeStyle = BADGE_COLORS.placeholderStripe
    ctx.lineWidth = this.s(0.45)
    for (let offset = -h; offset < w + h; offset += this.s(7)) {
      ctx.beginPath()
      ctx.moveTo(x + offset, y)
      ctx.lineTo(x + offset - h, y + h)
      ctx.stroke()
    }

    ctx.font = `${this.s(4.5)}px "${FONT_REGULAR}"`
    ctx.fillStyle = BADGE_COLORS.placeholderFg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Sin foto cargada', x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  private renderNameCompanyAndPosition(
    ctx: BadgeCanvasContext,
    input: BadgeRenderContext,
    hasFolio: boolean
  ) {
    const x = this.s(76)
    const width = this.s(96)
    const lineGap = this.s(0.5)
    const hasPuesto = !!input.puesto?.trim()
    const y = hasFolio ? this.s(34) : hasPuesto ? this.s(46) : this.s(52)
    const maxTextBottom = hasFolio ? this.s(88) : CANVAS_HEIGHT

    ctx.save()
    if (hasFolio) {
      ctx.beginPath()
      ctx.rect(x, y - this.s(9), width, maxTextBottom - y + this.s(9))
      ctx.clip()
    }

    ctx.font = `${this.s(9)}px "${FONT_BOLD}"`
    ctx.fillStyle = BADGE_COLORS.text
    let currentY = this.drawWrappedText(ctx, input.nombreCompleto, x, y, width, this.s(9) + lineGap)

    currentY += this.s(3)
    ctx.font = `${this.s(6.5)}px "${FONT_REGULAR}"`
    ctx.fillStyle = BADGE_COLORS.text
    currentY = this.drawWrappedText(
      ctx,
      input.empresa,
      x,
      currentY,
      width,
      this.s(6.5) + this.s(0.5)
    )

    if (hasPuesto) {
      currentY += this.s(2)
      ctx.font = `${this.s(6)}px "${FONT_REGULAR}"`
      ctx.fillStyle = BADGE_COLORS.textMuted
      currentY = this.drawWrappedText(
        ctx,
        input.puesto!,
        x,
        currentY,
        width,
        this.s(6) + this.s(0.5)
      )
    }

    const departamento = input.departamento?.trim()
    if (departamento) {
      currentY += this.s(1)
      ctx.font = `${this.s(5.5)}px "${FONT_REGULAR}"`
      ctx.fillStyle = BADGE_COLORS.textMuted
      this.drawWrappedText(ctx, departamento, x, currentY, width, this.s(5.5) + this.s(0.5))
    }

    ctx.restore()
  }

  /**
   * Datos de nómina bajo la foto, como campos de credencial (rótulo y valor).
   * La columna de la foto queda libre en los dos tipos de gafete: el bloque
   * REPSE y la insignia de colaborador viven a la derecha.
   */
  private renderPayrollFields(ctx: BadgeCanvasContext, input: BadgeRenderContext) {
    const numeroNomina = input.numeroNomina?.trim()
    if (!numeroNomina) return

    const x = this.s(10)
    const width = this.s(58)
    const y = this.s(113)

    ctx.font = `${this.s(4)}px "${FONT_BOLD}"`
    ctx.fillStyle = BADGE_COLORS.textMuted
    ctx.fillText('NO. DE NÓMINA', x, y)

    ctx.font = `${this.s(6)}px "${FONT_BOLD}"`
    ctx.fillStyle = BADGE_COLORS.text
    this.drawSingleLineTruncated(ctx, numeroNomina, x, y + this.s(7), width)
  }

  private renderFolioBlock(ctx: BadgeCanvasContext, input: BadgeRenderContext) {
    const x = this.s(76)
    const width = this.s(96)
    const y = this.s(92)

    ctx.font = `${this.s(5.5)}px "${FONT_REGULAR}"`
    ctx.fillStyle = BADGE_COLORS.textMuted
    ctx.fillText('FOLIO REPSE', x, y)

    ctx.font = `${this.s(6.5)}px "${FONT_BOLD}"`
    ctx.fillStyle = BADGE_COLORS.text
    this.drawSingleLineTruncated(ctx, input.folioRepse!, x, y + this.s(7), width)

    this.renderStatusBadge(ctx, x, y + this.s(17), input.folioVigente === true)
  }

  private renderCollaboratorBadge(ctx: BadgeCanvasContext) {
    const label = 'COLABORADOR ACTIVO'
    const fontSize = this.s(5.5)
    const dotRadius = this.s(1.5)
    const paddingX = this.s(4)
    const gap = this.s(2.5)

    ctx.font = `${fontSize}px "${FONT_BOLD}"`
    const textWidth = ctx.measureText(label).width
    const badgeW = paddingX * 2 + dotRadius * 2 + gap + textWidth
    const x = (CANVAS_WIDTH - badgeW) / 2
    const y = CANVAS_HEIGHT - this.s(24)

    this.renderStatusBadge(ctx, x, y, true, label)
  }

  private renderStatusBadge(
    ctx: BadgeCanvasContext,
    x: number,
    y: number,
    vigente: boolean,
    label?: string
  ) {
    const text = label ?? (vigente ? 'VIGENTE' : 'NO VIGENTE')
    const textColor = vigente ? BADGE_COLORS.vigente : BADGE_COLORS.noVigente
    const bgColor = vigente ? BADGE_COLORS.vigenteBg : BADGE_COLORS.noVigenteBg
    const fontSize = this.s(5.5)
    const dotRadius = this.s(1.5)
    const paddingX = this.s(4)
    const gap = this.s(2.5)
    const badgeH = this.s(9)

    ctx.font = `${fontSize}px "${FONT_BOLD}"`
    const textWidth = ctx.measureText(text).width
    const badgeW = paddingX * 2 + dotRadius * 2 + gap + textWidth

    ctx.fillStyle = bgColor
    this.roundedRectPath(ctx, x, y, badgeW, badgeH, badgeH / 2)
    ctx.fill()

    const dotCx = x + paddingX + dotRadius
    const dotCy = y + badgeH / 2
    ctx.beginPath()
    ctx.arc(dotCx, dotCy, dotRadius, 0, Math.PI * 2)
    ctx.fillStyle = textColor
    ctx.fill()

    ctx.fillStyle = textColor
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + paddingX + dotRadius * 2 + gap, dotCy)
    ctx.textBaseline = 'alphabetic'
  }

  private renderQr(ctx: BadgeCanvasContext, qrImage: Awaited<ReturnType<typeof loadImage>>) {
    const size = this.s(52)
    const x = CANVAS_WIDTH - size - this.s(8)
    const y = this.s(36)

    ctx.drawImage(qrImage, x, y, size, size)

    ctx.font = `${this.s(4.5)}px "${FONT_REGULAR}"`
    ctx.fillStyle = BADGE_COLORS.textMuted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Escanea para verificar', x + size / 2, y + size + this.s(3))
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private s(value: number): number {
    return value * SCALE
  }

  private ensureFontsRegistered() {
    if (fontsRegistered) return

    const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...FONTS_DIR_REL)
    GlobalFonts.registerFromPath(path.join(baseDir, 'Roboto-Regular.ttf'), FONT_REGULAR)
    GlobalFonts.registerFromPath(path.join(baseDir, 'Roboto-Bold.ttf'), FONT_BOLD)
    fontsRegistered = true
  }

  /**
   * Lectura tolerante de la foto: nunca bloquea el gafete.
   *
   * Delega en el resolutor de fotos de empleado, que distingue la key del
   * bucket de la URL del servidor de biometricos (las fotos que llegan de la
   * sincronizacion del checador no viven en el bucket).
   */
  async fetchImageTolerant(storedPath: string | null): Promise<Buffer | null> {
    return readEmployeePhotoBuffer(storedPath)
  }

  private async tryLoadImage(buffer: Buffer): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
    try {
      return await loadImage(buffer)
    } catch {
      return null
    }
  }

  private drawWrappedText(
    ctx: BadgeCanvasContext,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): number {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return y

    let line = ''
    let currentY = y

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, currentY)
        line = word
        currentY += lineHeight
      } else {
        line = testLine
      }
    }

    if (line) {
      ctx.fillText(line, x, currentY)
      currentY += lineHeight
    }

    return currentY
  }

  private truncateText(ctx: BadgeCanvasContext, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text

    let truncated = text
    while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1)
    }

    return truncated.length > 0 ? `${truncated}…` : text
  }

  /** Una sola línea con elipsis — espejo PDFKit `{ width, ellipsis }` del folio. */
  private drawSingleLineTruncated(
    ctx: BadgeCanvasContext,
    text: string,
    x: number,
    y: number,
    maxWidth: number
  ) {
    ctx.fillText(this.truncateText(ctx, text, maxWidth), x, y)
  }

  private roundedRectPath(
    ctx: BadgeCanvasContext,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + w - radius, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
    ctx.lineTo(x + w, y + h - radius)
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    ctx.lineTo(x + radius, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }
}
