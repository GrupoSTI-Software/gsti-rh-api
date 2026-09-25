import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import { getBusinessTimeZone } from '#utils/business_date'
import { reportText } from '#helpers/report_text'
import { REPORT_NEUTRAL_HEX, REPORT_NEUTRAL_PDF_FONTS } from '#constants/report_neutral_theme'
import type { OffboardingDocumentFieldKey } from './document_fields.constants.js'

/** Paleta neutral compartida por todos los descargables (sin marca). */
const PDF_COLORS = REPORT_NEUTRAL_HEX

/**
 * Tipografía neutral: fuentes estándar de pdfkit (sin la tipografía de
 * marca). Codifican WinAnsi, que cubre acentos, ñ, `§`, `—`, `–` y `•`.
 */
const FONT_REGULAR = REPORT_NEUTRAL_PDF_FONTS.regular
const FONT_BOLD = REPORT_NEUTRAL_PDF_FONTS.bold

/**
 * Leyenda de pie que el repo ya imprime en sus PDF. No cita artículo: la
 * ley vigente (DOF 2026-03-20) conserva el nombre. Se copia y no se importa
 * porque el servicio espejo la declara privada.
 */
const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

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
 * controles bidireccionales, colapsa espacios y recorta. Un dato ausente
 * ("null"/"undefined" interpolado) queda en blanco (`reportText`).
 */
export function sanitizeRenderText(value: string | null | undefined): string {
  return reportText(
    Array.from(reportText(value))
      .filter((char) => !isControlChar(char.codePointAt(0) ?? 0))
      .join('')
      .replace(BIDI_CONTROLS, '')
  )
}

/**
 * Valores YA RESUELTOS (saneados y normalizados) que entran a la guarda, por
 * `key` del catálogo. `''`, `null` o ausente = dato no capturado.
 */
export type DocumentCompletenessValues = Readonly<Record<string, string | null>>

/**
 * Guarda de completitud PURA (USRH1787433503689, adecuada por
 * USRH1789097550392): recibe la lista efectiva y los valores ya resueltos, no
 * consulta, no traduce y no lanza. Devuelve los campos faltantes en el orden
 * de `requiredFieldKeys` (regla 8); quien lanza es el servicio. Fail-closed:
 * una clave exigida que no venga en `values` cuenta como faltante, así los
 * campos que agregue el catálogo bloquean sin tocar esta función.
 */
export function collectMissingDocumentFields(
  requiredFieldKeys: readonly OffboardingDocumentFieldKey[],
  values: DocumentCompletenessValues
): OffboardingDocumentFieldKey[] {
  return requiredFieldKeys.filter((key) => {
    const value = values[key]
    return typeof value !== 'string' || value.trim().length === 0
  })
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
 * buffer, encabezado neutral, grid de datos, firmas y pie por página. Recibe
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
          Producer: 'PDFKit',
        },
      })

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
        this.renderPageHeader(doc, data.tradeName)
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
      .font(FONT_BOLD)
      .fontSize(16)
      .fillColor(PDF_COLORS.text)
      .text(LETTER_TEXT.title, margin, doc.y, { width: pageW, align: 'center' })
    doc.moveDown(0.2)
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(PDF_COLORS.textMuted)
      .text(`${LETTER_TEXT.folioLabel} ${data.folio}`, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
    doc.moveDown(1.4)

    // Párrafo declarativo
    doc
      .font(FONT_REGULAR)
      .fontSize(10.5)
      .fillColor(PDF_COLORS.text)
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
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(PDF_COLORS.textMuted)
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
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor(PDF_COLORS.textMuted)
        .text(row.label, x, rowTop, { width: width - 8, lineBreak: false, ellipsis: true })
      doc
        .font(FONT_BOLD)
        .fontSize(9.5)
        .fillColor(PDF_COLORS.text)
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
        .strokeColor(PDF_COLORS.border)
        .stroke()
      doc
        .font(FONT_BOLD)
        .fontSize(8.5)
        .fillColor(PDF_COLORS.text)
        .text(column.label, x, sigLineY + 5, { width: colW, align: 'center', lineBreak: false })
      doc
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor(PDF_COLORS.textMuted)
        .text(column.detail, x + 6, sigLineY + 18, {
          width: colW - 12,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        })
    })

    doc.y = sigLineY + 40
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(PDF_COLORS.textMuted)
      .text(LETTER_TEXT.signatures.autographNote, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
  }

  /**
   * Encabezado neutral de cada página: nombre comercial del patrón en texto
   * negro a la derecha (identifica al emisor de la constancia; no es marca)
   * y una línea delgada gris. Sin franja de color ni wordmark del producto.
   *
   * El cursor `doc.y` se restaura al terminar para evitar que un `text()`
   * en coordenadas absolutas arrastre la Y y provoque una página en blanco.
   */
  private renderPageHeader(doc: PDFKit.PDFDocument, tradeName: string) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const ruleY = 38
    const savedY = doc.y

    doc.save()
    if (tradeName) {
      doc
        .font(FONT_REGULAR)
        .fontSize(9)
        .fillColor(PDF_COLORS.text)
        .text(tradeName, margin, 24, {
          width: pageW,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
          height: 12,
        })
    }
    doc
      .moveTo(margin, ruleY)
      .lineTo(margin + pageW, ruleY)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke()
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
      .strokeColor(PDF_COLORS.border)
      .stroke()
    doc
      .font(FONT_REGULAR)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(
        `${LETTER_TEXT.footer.folio} ${data.folio} · ${LETTER_TEXT.footer.issuedAt} ${issuedAt}`,
        margin,
        bottomY + 8,
        { width: pageW / 2, align: 'left', lineBreak: false, height: 10 }
      )
    doc
      .font(FONT_BOLD)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(`${LETTER_TEXT.footer.page} ${currentPage} / ${totalPages}`, margin + pageW / 2, bottomY + 8, {
        width: pageW / 2,
        align: 'right',
        lineBreak: false,
        height: 10,
      })
    doc
      .font(FONT_REGULAR)
      .fontSize(6.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(CONFIDENTIALITY_NOTE, margin, bottomY + 22, {
        width: pageW,
        align: 'center',
        lineBreak: false,
        height: 10,
      })
    doc.restore()
    doc.y = savedY
  }

  /** `YYYY-MM-DD` civil → `dd/MM/aaaa` (numérico, sin depender de locale). */
  private formatDate(iso: string): string {
    return DateTime.fromISO(iso, { zone: getBusinessTimeZone() }).toFormat('dd/LL/yyyy')
  }
}
