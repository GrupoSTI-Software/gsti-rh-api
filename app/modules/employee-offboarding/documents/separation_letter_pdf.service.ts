import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import logger from '@adonisjs/core/services/logger'
import { getBusinessTimeZone } from '#utils/business_date'
import { MISSING_FIELD_ORDER } from './documents.constants.js'

/**
 * Paleta de marca Valanserh (misma que los demás PDF del repo).
 * NO modificar sin actualizar la guía de DS Valanserh.
 */
const BRAND_COLORS = {
  primary: '#3D5DC0',
  text: '#1F2937',
  textMuted: '#6B7280',
  textLight: '#FFFFFF',
  border: '#D1D5DB',
  borderLight: '#E5E7EB',
} as const

const PRODUCT_WORDMARK = 'Valanserh'

/**
 * Leyenda de pie que el repo ya imprime en sus PDF. No cita artículo: la
 * ley vigente (DOF 2026-03-20) conserva el nombre. Se copia y no se importa
 * porque el servicio espejo la declara privada.
 */
const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

/** Ruta relativa a `resources/fonts/` desde este archivo (4 niveles hasta la raíz). */
const FONTS_DIR_REL = ['..', '..', '..', '..', 'resources', 'fonts'] as const

/** Altura estimada del bloque de firmas: dos líneas + etiquetas + leyenda. */
const SIGNATURES_BLOCK_H = 130

/**
 * Controles C0/C1 (sin tab/LF/CR, que colapsa el paso siguiente). Por código
 * de carácter y no por regex: la regla `no-control-regex` del repo prohíbe
 * los rangos de control en literales.
 */
function isControlChar(code: number): boolean {
  return (
    code <= 8 ||
    code === 11 ||
    code === 12 ||
    (code >= 14 && code <= 31) ||
    (code >= 127 && code <= 159)
  )
}

/** Controles bidireccionales: el override U+202E renderiza un nombre al revés. */
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

/**
 * Plantilla FIJA del sistema, siempre en español (regla 3): un solo bloque de
 * constantes. Una plantilla bilingüe futura solo toca este bloque.
 */
const LETTER_TEXT = {
  title: 'CONSTANCIA DE SEPARACIÓN',
  folioLabel: 'Folio:',
  declaration: (data: {
    legalName: string
    employeeName: string
    positionName: string
    departmentOrUnit: string
    hireDate: string
    referenceDate: string
    seniority: string
  }) =>
    `${data.legalName}, por conducto de su representante, HACE CONSTAR que ${data.employeeName} ` +
    `prestó sus servicios en esta empresa desempeñando el puesto de ${data.positionName}, ` +
    `adscrito a ${data.departmentOrUnit}, del ${data.hireDate} al ${data.referenceDate}, ` +
    `acumulando una antigüedad de ${data.seniority}.`,
  legalBasis:
    'La presente constancia se expide a solicitud de la persona interesada y para los fines ' +
    'legales a que haya lugar, en cumplimiento de lo dispuesto por el artículo 132, fracción VIII, ' +
    'de la Ley Federal del Trabajo.',
  fields: {
    employeeName: 'Nombre completo',
    positionName: 'Puesto',
    departmentOrUnit: 'Departamento o unidad',
    hireDate: 'Fecha de ingreso',
    referenceDate: 'Fecha de separación',
    seniority: 'Antigüedad',
    legalName: 'Razón social',
  },
  signatures: {
    representative: 'Representante de la empresa',
    acknowledgement: 'Recibí de conformidad',
    acknowledgementDate: 'Fecha: ____________',
    autographNote: 'Las firmas deben ser autógrafas.',
  },
  footer: {
    folio: 'Folio',
    issuedAt: 'Emitida el',
    page: 'Página',
  },
  info: {
    title: 'Constancia de separación',
    subject: 'Constancia de servicios (LFT art. 132 fr. VIII)',
  },
} as const

/** Antigüedad en años y meses CUMPLIDOS (regla 8): los días sobrantes se descartan. */
export interface SeniorityParts {
  years: number
  months: number
}

/**
 * Calcula la antigüedad entre ingreso y separación en la zona de negocio.
 * `Math.floor` en ambos componentes: un documento laboral no infla
 * antigüedad. Función pura, sin consultas.
 *
 * @param hireIso - Fecha de ingreso `YYYY-MM-DD`.
 * @param referenceIso - Fecha de separación `YYYY-MM-DD`.
 */
export function computeSeniority(hireIso: string, referenceIso: string): SeniorityParts {
  const zone = getBusinessTimeZone()
  const from = DateTime.fromISO(hireIso, { zone }).startOf('day')
  const to = DateTime.fromISO(referenceIso, { zone }).startOf('day')
  const diff = to.diff(from, ['years', 'months', 'days'])
  return {
    years: Math.max(0, Math.floor(diff.years)),
    months: Math.max(0, Math.floor(diff.months)),
  }
}

/**
 * "N años y M meses" con singular cuando corresponde; "M meses" sin años;
 * "menos de un mes" cuando ambos son cero.
 */
export function formatSeniority(parts: SeniorityParts): string {
  const years = parts.years === 1 ? '1 año' : `${parts.years} años`
  const months = parts.months === 1 ? '1 mes' : `${parts.months} meses`
  if (parts.years === 0 && parts.months === 0) return 'menos de un mes'
  if (parts.years === 0) return months
  return `${years} y ${months}`
}

/**
 * Saneado del texto que entra al PDF Y al snapshot (si divergieran, el
 * snapshot dejaría de servir para auditar): elimina controles C0/C1 y los
 * controles bidireccionales, colapsa espacios y recorta.
 */
export function sanitizeRenderText(value: string): string {
  return Array.from(`${value}`)
    .filter((char) => !isControlChar(char.codePointAt(0) ?? 0))
    .join('')
    .replace(BIDI_CONTROLS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Datos que bloquean la emisión (USRH1787433503689, regla 1). */
export type MissingSeparationLetterField =
  | 'legalName'
  | 'employeeName'
  | 'position'
  | 'hireDate'
  | 'separationDate'

/** Valores YA RESUELTOS (saneados y normalizados) que entran a la guarda. */
export interface SeparationLetterCompletenessInput {
  legalName: string
  employeeName: string
  position: string
  hireDate: string | null
  separationDate: string | null
}

/**
 * Guarda de completitud PURA: recibe valores ya resueltos, no consulta, no
 * traduce y no lanza. Devuelve los campos faltantes en el orden de
 * `MISSING_FIELD_ORDER` (regla 8); quien lanza es el servicio. El
 * departamento no bloquea (regla 4).
 */
export function collectMissingSeparationLetterFields(
  data: SeparationLetterCompletenessInput
): MissingSeparationLetterField[] {
  const missing = new Set<MissingSeparationLetterField>()
  if (data.legalName.trim().length === 0) missing.add('legalName')
  if (data.employeeName.trim().length === 0) missing.add('employeeName')
  if (data.position.trim().length === 0) missing.add('position')
  if (!data.hireDate) missing.add('hireDate')
  if (!data.separationDate) missing.add('separationDate')
  return MISSING_FIELD_ORDER.filter((field) => missing.has(field))
}

/** Datos YA RESUELTOS y saneados para el render; el servicio nunca consulta. */
export interface SeparationLetterData {
  folio: string
  employeeName: string
  positionName: string
  departmentOrUnit: string
  legalName: string
  hireDateIso: string
  referenceDateIso: string
  seniority: SeniorityParts
  tradeName: string
  issuedAt: DateTime
}

/**
 * Render de la constancia de separación (USRH1787433503686) con `pdfkit`.
 * Espejo de `traumatic_event_report_document_service`: construcción del
 * buffer, franja de marca, grid de datos, firmas y pie por página. Recibe
 * un objeto de datos, nunca un id.
 *
 * Censo de datos personales: lo impreso (nombre, puesto, adscripción,
 * fechas, antigüedad, razón social) NO está en `sensitive_fields.ts`. Si
 * alguien agrega RFC/CURP/NSS del colaborador, su salario, cualquier
 * importe o el RFC del patrón, este slice pasa al circuito de
 * `PiiExportService` con motivo, bitácora y gate reforzado: consecuencia
 * automática, no mejora opcional. `preload('person')` descifra RFC/CURP/NSS
 * en memoria y el PDF no ejecuta `serialize`: este código simplemente no
 * toca esas propiedades.
 */
export default class SeparationLetterPdfService {
  async render(data: SeparationLetterData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 70, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: LETTER_TEXT.info.title,
          Author: data.legalName,
          Subject: LETTER_TEXT.info.subject,
          Creator: PRODUCT_WORDMARK,
          Producer: PRODUCT_WORDMARK,
        },
      })

      this.registerMulishFonts(doc)

      const chunks: Uint8Array[] = []
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      doc.on('end', () => {
        const total = chunks.reduce((acc, c) => acc + c.length, 0)
        const merged = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          merged.set(c, offset)
          offset += c.length
        }
        resolve(Buffer.from(merged.buffer))
      })
      doc.on('error', reject)

      this.renderContent(doc, data)

      const pageRange = doc.bufferedPageRange()
      for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
        doc.switchToPage(i)
        this.renderBrandStrip(doc, data.tradeName)
        this.renderPageFooter(doc, data, i - pageRange.start + 1, pageRange.count)
      }

      doc.end()
    })
  }

  private renderContent(doc: PDFKit.PDFDocument, data: SeparationLetterData) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const hireDate = this.formatDate(data.hireDateIso)
    const referenceDate = this.formatDate(data.referenceDateIso)
    const seniority = formatSeniority(data.seniority)

    doc.y = doc.page.margins.top

    // Título + folio
    doc
      .font('Mulish-Bold')
      .fontSize(16)
      .fillColor(BRAND_COLORS.text)
      .text(LETTER_TEXT.title, margin, doc.y, { width: pageW, align: 'center' })
    doc.moveDown(0.2)
    doc
      .font('Mulish')
      .fontSize(8)
      .fillColor(BRAND_COLORS.textMuted)
      .text(`${LETTER_TEXT.folioLabel} ${data.folio}`, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
    doc.moveDown(1.4)

    // Párrafo declarativo
    doc
      .font('Mulish')
      .fontSize(10.5)
      .fillColor(BRAND_COLORS.text)
      .text(
        LETTER_TEXT.declaration({
          legalName: data.legalName,
          employeeName: data.employeeName,
          positionName: data.positionName,
          departmentOrUnit: data.departmentOrUnit,
          hireDate,
          referenceDate,
          seniority,
        }),
        margin,
        doc.y,
        { width: pageW, align: 'justify', lineGap: 2 }
      )
    doc.moveDown(0.8)

    // Fundamento
    doc
      .font('Mulish')
      .fontSize(9)
      .fillColor(BRAND_COLORS.textMuted)
      .text(LETTER_TEXT.legalBasis, margin, doc.y, { width: pageW, align: 'justify', lineGap: 1 })
    doc.moveDown(1.2)

    // Grid de datos: nombre, puesto y razón social a ANCHO COMPLETO — en
    // media página, `ellipsis` truncaría en silencio un puesto de 100 chars.
    this.renderFieldRows(doc, margin, pageW, [
      { label: LETTER_TEXT.fields.employeeName, value: data.employeeName, full: true },
      { label: LETTER_TEXT.fields.positionName, value: data.positionName, full: true },
      { label: LETTER_TEXT.fields.departmentOrUnit, value: data.departmentOrUnit },
      { label: LETTER_TEXT.fields.hireDate, value: hireDate },
      { label: LETTER_TEXT.fields.referenceDate, value: referenceDate },
      { label: LETTER_TEXT.fields.seniority, value: seniority },
      { label: LETTER_TEXT.fields.legalName, value: data.legalName, full: true },
    ])

    this.renderSignatures(doc, margin, pageW, data)
  }

  /**
   * Filas etiqueta + valor con cursor PROPIO (`rowTop`): `doc.text(x, y)`
   * avanza `doc.y` tras cada llamada y, con dos columnas, la segunda
   * quedaría desalineada y el grid crecería hasta empujar una segunda
   * página. `full` ocupa el ancho de página; si no, van de dos en dos.
   * Etiqueta 8 pt gris, valor 9.5 pt semibold, `rowH = 28`.
   */
  private renderFieldRows(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    rows: Array<{ label: string; value: string; full?: boolean }>
  ) {
    const halfW = pageW / 2
    const rowH = 28
    let rowTop = doc.y
    let col = 0

    const paint = (x: number, width: number, row: { label: string; value: string }) => {
      doc
        .font('Mulish')
        .fontSize(8)
        .fillColor(BRAND_COLORS.textMuted)
        .text(row.label, x, rowTop, { width: width - 8, lineBreak: false, ellipsis: true })
      doc
        .font('Mulish-SemiBold')
        .fontSize(9.5)
        .fillColor(BRAND_COLORS.text)
        .text(row.value, x, rowTop + 11, { width: width - 8, lineBreak: false, ellipsis: true })
    }

    for (const row of rows) {
      if (row.full) {
        if (col === 1) {
          rowTop += rowH
          col = 0
        }
        paint(margin, pageW, row)
        rowTop += rowH
        continue
      }
      paint(margin + col * halfW, halfW, row)
      if (col === 1) {
        rowTop += rowH
        col = 0
      } else {
        col = 1
      }
    }
    if (col === 1) {
      rowTop += rowH
    }
    doc.y = rowTop
    doc.moveDown(0.8)
  }

  /** Dos columnas: representante (sin nombre impreso) y acuse de recibido. */
  private renderSignatures(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    data: SeparationLetterData
  ) {
    if (doc.y + SIGNATURES_BLOCK_H > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    const colW = pageW / 2
    const sigLineY = doc.y + 48
    const columns: Array<{ label: string; detail: string }> = [
      { label: LETTER_TEXT.signatures.representative, detail: data.legalName },
      {
        label: LETTER_TEXT.signatures.acknowledgement,
        detail: `${data.employeeName} — ${LETTER_TEXT.signatures.acknowledgementDate}`,
      },
    ]

    columns.forEach((column, idx) => {
      const x = margin + colW * idx
      doc
        .moveTo(x + 10, sigLineY)
        .lineTo(x + colW - 10, sigLineY)
        .lineWidth(0.8)
        .strokeColor(BRAND_COLORS.border)
        .stroke()
      doc
        .font('Mulish-SemiBold')
        .fontSize(8.5)
        .fillColor(BRAND_COLORS.text)
        .text(column.label, x, sigLineY + 5, { width: colW, align: 'center', lineBreak: false })
      doc
        .font('Mulish')
        .fontSize(8)
        .fillColor(BRAND_COLORS.textMuted)
        .text(column.detail, x + 6, sigLineY + 18, {
          width: colW - 12,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        })
    })

    doc.y = sigLineY + 40
    doc
      .font('Mulish')
      .fontSize(8)
      .fillColor(BRAND_COLORS.textMuted)
      .text(LETTER_TEXT.signatures.autographNote, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
  }

  /** Franja de 24 px: wordmark a la izquierda, nombre comercial a la derecha. */
  private renderBrandStrip(doc: PDFKit.PDFDocument, tradeName: string) {
    const pageW = doc.page.width
    const stripH = 24
    const margin = doc.page.margins.left
    const savedY = doc.y

    doc.save()
    doc.rect(0, 0, pageW, stripH).fill(BRAND_COLORS.primary)
    doc
      .font('Mulish-Bold')
      .fontSize(10)
      .fillColor(BRAND_COLORS.textLight)
      .text(PRODUCT_WORDMARK, margin, 7, { width: pageW / 2 - margin, lineBreak: false, height: 12 })
    if (tradeName) {
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.textLight)
        .text(tradeName, pageW / 2, 8, {
          width: pageW / 2 - margin,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
          height: 12,
        })
    }
    doc.restore()
    doc.y = savedY
  }

  /** Pie: folio + emisión a la izquierda, página a la derecha, leyenda centrada. */
  private renderPageFooter(
    doc: PDFKit.PDFDocument,
    data: SeparationLetterData,
    currentPage: number,
    totalPages: number
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const bottomY = doc.page.height - 60
    const savedY = doc.y
    const issuedAt = data.issuedAt.setZone(getBusinessTimeZone()).toFormat('dd/LL/yyyy HH:mm')

    doc.save()
    doc
      .moveTo(margin, bottomY)
      .lineTo(margin + pageW, bottomY)
      .lineWidth(0.5)
      .strokeColor(BRAND_COLORS.borderLight)
      .stroke()
    doc
      .font('Mulish')
      .fontSize(7.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        `${LETTER_TEXT.footer.folio} ${data.folio} · ${LETTER_TEXT.footer.issuedAt} ${issuedAt}`,
        margin,
        bottomY + 8,
        { width: pageW / 2, align: 'left', lineBreak: false, height: 10 }
      )
    doc
      .font('Mulish-Bold')
      .fontSize(7.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(`${LETTER_TEXT.footer.page} ${currentPage} / ${totalPages}`, margin + pageW / 2, bottomY + 8, {
        width: pageW / 2,
        align: 'right',
        lineBreak: false,
        height: 10,
      })
    doc
      .font('Mulish')
      .fontSize(6.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(CONFIDENTIALITY_NOTE, margin, bottomY + 22, {
        width: pageW,
        align: 'center',
        lineBreak: false,
        height: 10,
      })
    doc.restore()
    doc.y = savedY
  }

  /**
   * Mulish con fallback a Helvetica. El `catch` LOGUEA `warn`: Helvetica
   * (WinAnsi) reduce el repertorio de caracteres sin avisar.
   */
  private registerMulishFonts(doc: PDFKit.PDFDocument) {
    const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...FONTS_DIR_REL)
    try {
      doc.registerFont('Mulish', path.join(baseDir, 'Mulish-Regular.ttf'))
      doc.registerFont('Mulish-Bold', path.join(baseDir, 'Mulish-Bold.ttf'))
      doc.registerFont('Mulish-SemiBold', path.join(baseDir, 'Mulish-SemiBold.ttf'))
    } catch (error) {
      logger.warn(
        { err: error, fontsDir: baseDir },
        'Constancia de separación: fuentes Mulish no disponibles, se usa Helvetica'
      )
      doc.registerFont('Mulish', 'Helvetica')
      doc.registerFont('Mulish-Bold', 'Helvetica-Bold')
      doc.registerFont('Mulish-SemiBold', 'Helvetica-Bold')
    }
  }

  /** `YYYY-MM-DD` civil → `dd/MM/aaaa` (numérico, sin depender de locale). */
  private formatDate(iso: string): string {
    return DateTime.fromISO(iso, { zone: getBusinessTimeZone() }).toFormat('dd/LL/yyyy')
  }
}
