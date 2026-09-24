import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import TraumaticEventReport from '#models/traumatic_event_report'
import SystemSettingService from '#services/system_setting_service'
import TraumaticEventReportService from '#services/traumatic_event_report_service'
import { REPORT_NEUTRAL_HEX, REPORT_NEUTRAL_PDF_FONTS } from '#constants/report_neutral_theme'
import { ETR_ERROR_CODES } from '../constants/traumatic_event_report_error_codes.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'
import { reportFullName, reportText } from '#helpers/report_text'

/** Paleta neutral compartida por todos los descargables (sin marca). */
const PDF_COLORS = REPORT_NEUTRAL_HEX

/**
 * Tipografía neutral: fuentes estándar de pdfkit (sin la tipografía de
 * marca). Codifican WinAnsi, que cubre acentos, ñ, `§`, `—`, `–` y `•`.
 */
const FONT_REGULAR = REPORT_NEUTRAL_PDF_FONTS.regular
const FONT_BOLD = REPORT_NEUTRAL_PDF_FONTS.bold

const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

/** Zona horaria del proyecto (CDMX). */
const REPORT_TIMEZONE = 'America/Mexico_City'

/**
 * Campos que deben estar poblados para generar el escrito §6.5.
 *
 * TODO: Confirmar con el equipo si `description` e `involvedPeople` deben
 * ser obligatorios para emitir el 400 ETR.VAL.DOC.001 o si se imprime el
 * documento con espacios en blanco cuando alguno falta. Por ahora se
 * validan los cuatro campos del escrito (descripción, involucrados,
 * occurredAt, elaboratedAt).
 */
/**
 * Campos obligatorios validados antes de generar el escrito §6.5.
 * TODO: confirmar con el equipo si deben mantenerse o si el PDF debe
 * generarse siempre con espacios en blanco cuando alguno falta.
 */
export const REQUIRED_FIELDS_FOR_DOC = [
  'traumaticEventReportDescription',
  'traumaticEventReportInvolvedPeople',
  'traumaticEventReportOccurredAt',
  'traumaticEventReportElaboratedAt',
] as const satisfies ReadonlyArray<keyof TraumaticEventReport>

/**
 * Valida que el reporte tenga los campos mínimos para generar el escrito §6.5.
 * Se exporta para facilitar las pruebas unitarias en aislamiento (sin BD).
 *
 * @throws TraumaticEventReportError 400 ETR.VAL.DOC.001 si algún campo falta.
 *
 * TODO: revisar con el equipo si esta validación debe mantenerse o si se
 * prefiere siempre generar el PDF con espacios en blanco cuando alguno falta.
 */
export function assertDocumentComplete(
  report: Pick<
    TraumaticEventReport,
    | 'traumaticEventReportDescription'
    | 'traumaticEventReportInvolvedPeople'
    | 'traumaticEventReportOccurredAt'
    | 'traumaticEventReportElaboratedAt'
  >
): void {
  const missing: string[] = []

  if (!report.traumaticEventReportDescription?.trim()) {
    missing.push('traumaticEventReportDescription')
  }
  if (!report.traumaticEventReportInvolvedPeople?.trim()) {
    missing.push('traumaticEventReportInvolvedPeople')
  }
  if (!report.traumaticEventReportOccurredAt) {
    missing.push('traumaticEventReportOccurredAt')
  }
  if (!report.traumaticEventReportElaboratedAt) {
    missing.push('traumaticEventReportElaboratedAt')
  }

  if (missing.length > 0) {
    throw new TraumaticEventReportError(
      'El reporte no tiene todos los campos requeridos para generar el escrito §6.5 ' +
        `(${REQUIRED_FIELDS_FOR_DOC.join(', ')}). Faltantes: ${missing.join(', ')}.`,
      ETR_ERROR_CODES.DOC_INCOMPLETE,
      400,
      'reporte-incompleto'
    )
  }
}

/**
 * Genera el PDF del escrito de informe de acontecimiento traumático severo
 * según el formato del numeral 6.5 de la NOM-035-STPS-2018.
 *
 * El documento incluye:
 *  - Encabezado neutral con el nombre comercial de la empresa emisora.
 *  - Fundamento legal (NOM-035 §6.5).
 *  - Fecha de elaboración.
 *  - Datos del trabajador (nombre, código, departamento, puesto).
 *  - Tipo de evento y fecha de ocurrencia.
 *  - Descripción del acontecimiento.
 *  - Personas involucradas.
 *  - Espacio para firmas: trabajador, representante patronal, testigo.
 *  - Pie de página con folio, fecha de generación y leyenda de confidencialidad.
 *
 * El PDF se genera en memoria (Buffer); no se persiste en disco.
 */
export default class TraumaticEventReportDocumentService {
  private readonly reportService = new TraumaticEventReportService()

  /**
   * Carga el reporte con sus relaciones, valida completitud y genera el PDF.
   *
   * @param reportId ID del reporte de evento traumático.
   * @param allowedBusinessUnitIds Scope multitenant del usuario autenticado.
   * @returns Buffer del PDF generado en memoria.
   * @throws TraumaticEventReportError 404 si el reporte no existe o está fuera del scope.
   * @throws TraumaticEventReportError 400 ETR.VAL.DOC.001 si faltan campos obligatorios.
   */
  async buildDocument(reportId: number, allowedBusinessUnitIds: number[]): Promise<Buffer> {
    const report = await this.loadReportWithRelations(reportId, allowedBusinessUnitIds)
    this.assertCompleteForDocument(report)
    const tradeName = await this.fetchTradeName()
    return this.renderPdf(report, tradeName)
  }

  // ---------------------------------------------------------------------------
  // Carga y validaciones
  // ---------------------------------------------------------------------------

  private async loadReportWithRelations(
    reportId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<TraumaticEventReport> {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const report = await TraumaticEventReport.query()
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_report_deleted_at')
      .preload('employee', (q) => {
        q.preload('person')
        q.preload('department')
        q.preload('position')
      })
      .preload('traumaticEventType')
      .firstOrFail()

    return report
  }

  private assertCompleteForDocument(report: TraumaticEventReport): void {
    assertDocumentComplete(report)
  }

  // ---------------------------------------------------------------------------
  // Generación del PDF
  // ---------------------------------------------------------------------------

  private async renderPdf(report: TraumaticEventReport, tradeName: string): Promise<Buffer> {
    const folio = this.generateFolio(report.traumaticEventReportId)
    const generatedAt = DateTime.now().setZone(REPORT_TIMEZONE)

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 70, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: `Escrito de Informe de Acontecimiento Traumático — Reporte #${report.traumaticEventReportId}`,
          Author: tradeName,
          Subject:
            'NOM-035-STPS-2018 §6.5 — Escrito de informe de acontecimiento traumático severo',
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

      this.renderDocumentContent(doc, report, tradeName, folio, generatedAt)

      const pageRange = doc.bufferedPageRange()
      const totalPages = pageRange.count
      for (let i = pageRange.start; i < pageRange.start + totalPages; i++) {
        doc.switchToPage(i)
        this.renderPageHeader(doc, tradeName)
        this.renderPageFooter(doc, folio, generatedAt, i - pageRange.start + 1, totalPages)
      }

      doc.end()
    })
  }

  /**
   * Construye el contenido principal del escrito §6.5 en orden:
   *  1. Título y metadatos del escrito.
   *  2. Fundamento legal.
   *  3. Datos del trabajador.
   *  4. Datos del evento (tipo, fecha de ocurrencia, descripción, involucrados).
   *  5. Espacio de firmas.
   */
  private renderDocumentContent(
    doc: PDFKit.PDFDocument,
    report: TraumaticEventReport,
    tradeName: string,
    folio: string,
    generatedAt: DateTime
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2

    doc.y = doc.page.margins.top + 8

    this.renderDocumentHeader(doc, margin, pageW, tradeName, folio, generatedAt, report)
    this.renderLegalFoundation(doc, margin, pageW)
    this.renderWorkerSection(doc, margin, pageW, report)
    this.renderEventSection(doc, margin, pageW, report)
    this.renderDescriptionSection(doc, margin, pageW, report)
    this.renderInvolvedPeopleSection(doc, margin, pageW, report)
    this.renderSignaturesSection(doc, margin, pageW)
  }

  // ---------------------------------------------------------------------------
  // Bloques visuales del escrito
  // ---------------------------------------------------------------------------

  /**
   * Cabecera del documento: título oficial, empresa, folio y fecha de elaboración.
   */
  private renderDocumentHeader(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    tradeName: string,
    folio: string,
    generatedAt: DateTime,
    report: TraumaticEventReport
  ) {
    doc
      .font(FONT_BOLD)
      .fontSize(15)
      .fillColor(PDF_COLORS.text)
      .text('Escrito de Informe de Acontecimiento Traumático Severo', margin, doc.y, {
        width: pageW,
        align: 'left',
      })

    doc.moveDown(0.25)
    doc
      .font(FONT_REGULAR)
      .fontSize(9.5)
      .fillColor(PDF_COLORS.textMuted)
      .text('NOM-035-STPS-2018, Numeral 6.5', margin, doc.y, {
        width: pageW,
        align: 'left',
        lineBreak: false,
      })

    doc.moveDown(0.3)

    // Dato ausente en blanco: sin nombre comercial, la línea empieza en el folio.
    const metaLeft = reportText(tradeName)
    const elaboratedDisplay = this.formatDateTimeDmy(report.traumaticEventReportElaboratedAt)

    const metaLine = [metaLeft, `Folio: ${folio}`, `Fecha de elaboración: ${elaboratedDisplay}`]
      .filter(Boolean)
      .join('   ·   ')
    doc
      .font(FONT_REGULAR)
      .fontSize(9.5)
      .fillColor(PDF_COLORS.text)
      .text(metaLine, margin, doc.y, { width: pageW, align: 'left' })

    doc.moveDown(0.2)
    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(PDF_COLORS.textMuted)
      .text(
        `Generado: ${generatedAt.toFormat('dd/LL/yyyy HH:mm')} (CDMX)   ·   Reporte #${report.traumaticEventReportId}`,
        margin,
        doc.y,
        { width: pageW, align: 'left', lineBreak: false }
      )

    doc.moveDown(0.8)
    doc
      .moveTo(margin, doc.y)
      .lineTo(margin + pageW, doc.y)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke()
    doc.moveDown(0.6)
  }

  /**
   * Bloque de fundamento legal del escrito (NOM-035 §6.5).
   */
  private renderLegalFoundation(doc: PDFKit.PDFDocument, margin: number, pageW: number) {
    doc
      .font(FONT_BOLD)
      .fontSize(10.5)
      .fillColor(PDF_COLORS.text)
      .text('Fundamento legal', margin, doc.y, { width: pageW })

    doc.moveDown(0.2)
    doc
      .font(FONT_REGULAR)
      .fontSize(9.5)
      .fillColor(PDF_COLORS.text)
      .text(
        'NOM-035-STPS-2018, numeral 6.5: el patrón debe implementar acciones para informar por escrito ' +
          'sobre el acontecimiento traumático severo al trabajador que lo experimentó o presenció, con los ' +
          'datos del evento, personas involucradas y descripción de lo ocurrido.',
        margin,
        doc.y,
        { width: pageW, lineGap: 1 }
      )

    doc.moveDown(0.8)
  }

  /**
   * Sección de datos del trabajador afectado.
   */
  private renderWorkerSection(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    report: TraumaticEventReport
  ) {
    this.renderSectionTitle(doc, margin, pageW, 'I. Datos del trabajador')

    const person = report.employee?.person
    const employee = report.employee

    const fullName = person
      ? reportFullName(person.personFirstname, person.personLastname, person.personSecondLastname)
      : ''

    const rows: Array<{ label: string; value: string }> = [
      { label: 'Nombre completo', value: fullName },
      { label: 'Código de empleado', value: reportText(employee?.employeeCode) },
      { label: 'Departamento', value: reportText(employee?.department?.departmentName) },
      { label: 'Puesto', value: reportText(employee?.position?.positionName) },
      { label: 'CURP', value: reportText(person?.personCurp) },
    ]

    this.renderFieldGrid(doc, margin, pageW, rows)
    doc.moveDown(0.6)
  }

  /**
   * Sección de datos del evento (tipo y fecha de ocurrencia).
   */
  private renderEventSection(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    report: TraumaticEventReport
  ) {
    this.renderSectionTitle(doc, margin, pageW, 'II. Datos del acontecimiento')

    const occurredDisplay = this.formatDateDmy(report.traumaticEventReportOccurredAt)

    const rows: Array<{ label: string; value: string }> = [
      {
        label: 'Tipo de acontecimiento traumático',
        value: reportText(report.traumaticEventType?.traumaticEventTypeName),
      },
      { label: 'Fecha de ocurrencia', value: occurredDisplay },
      {
        label: 'Registrado por',
        value: report.traumaticEventReportOrigin === 'rh' ? 'Área de RH' : 'Trabajador',
      },
    ]

    this.renderFieldGrid(doc, margin, pageW, rows)
    doc.moveDown(0.6)
  }

  /**
   * Sección de descripción del acontecimiento (campo de texto largo).
   */
  private renderDescriptionSection(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    report: TraumaticEventReport
  ) {
    this.renderSectionTitle(doc, margin, pageW, 'III. Descripción del acontecimiento')

    const text = reportText(report.traumaticEventReportDescription)

    this.renderTextBlock(doc, margin, pageW, text)
    doc.moveDown(0.6)
  }

  /**
   * Sección de personas involucradas.
   */
  private renderInvolvedPeopleSection(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    report: TraumaticEventReport
  ) {
    this.renderSectionTitle(doc, margin, pageW, 'IV. Personas involucradas')

    const text = reportText(report.traumaticEventReportInvolvedPeople)

    this.renderTextBlock(doc, margin, pageW, text)
    doc.moveDown(0.6)
  }

  /**
   * Sección de firmas: trabajador, representante patronal y testigo.
   * Se imprime en la parte final; si no hay espacio suficiente se agrega
   * una nueva página para mantener el bloque íntegro.
   */
  private renderSignaturesSection(doc: PDFKit.PDFDocument, margin: number, pageW: number) {
    /** Altura estimada del bloque de firmas completo: título + 3 líneas + separadores. */
    const SIGNATURES_BLOCK_H = 130

    if (doc.y + SIGNATURES_BLOCK_H > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    this.renderSectionTitle(doc, margin, pageW, 'V. Firmas')

    doc.moveDown(0.5)

    const colW = pageW / 3
    const sigLineY = doc.y + 40
    const sigLabels = ['Trabajador', 'Representante patronal', 'Testigo']

    sigLabels.forEach((label, idx) => {
      const x = margin + colW * idx
      const lineXStart = x + 10
      const lineXEnd = x + colW - 10

      doc
        .moveTo(lineXStart, sigLineY)
        .lineTo(lineXEnd, sigLineY)
        .lineWidth(0.8)
        .strokeColor(PDF_COLORS.border)
        .stroke()

      doc
        .font(FONT_REGULAR)
        .fontSize(8.5)
        .fillColor(PDF_COLORS.textMuted)
        .text(label, x, sigLineY + 5, {
          width: colW,
          align: 'center',
          lineBreak: false,
        })
    })

    doc.y = sigLineY + 30

    doc.moveDown(0.5)
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(PDF_COLORS.textMuted)
      .text(
        'Las firmas deben ser autógrafas. Este documento puede reproducirse con los mismos efectos.',
        margin,
        doc.y,
        { width: pageW, align: 'center', lineGap: 1 }
      )

    doc.moveDown(0.6)
  }

  // ---------------------------------------------------------------------------
  // Bloques visuales reutilizables
  // ---------------------------------------------------------------------------

  /**
   * Encabezado neutral de cada página: nombre comercial del patrón en texto
   * negro a la derecha (identifica al emisor del escrito; no es marca) y
   * una línea delgada gris. Sin franja de color ni wordmark del producto.
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

  /**
   * Pie de página — idéntico al de `employee_lactation_compliance_report_service`:
   * folio + fecha de generación (izq.), número de página (der.), leyenda de
   * confidencialidad (centrada abajo).
   */
  private renderPageFooter(
    doc: PDFKit.PDFDocument,
    folio: string,
    generatedAt: DateTime,
    currentPage: number,
    totalPages: number
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const bottomY = doc.page.height - 60
    const savedY = doc.y

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
        `Folio ${folio} · Generado ${generatedAt.toFormat('dd/LL/yyyy HH:mm')} (CDMX)`,
        margin,
        bottomY + 8,
        { width: pageW / 2, align: 'left', lineBreak: false, height: 10 }
      )

    doc
      .font(FONT_BOLD)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(`Página ${currentPage} / ${totalPages}`, margin + pageW / 2, bottomY + 8, {
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

  /**
   * Título de sección en negrita, texto negro.
   */
  private renderSectionTitle(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    title: string
  ) {
    doc
      .font(FONT_BOLD)
      .fontSize(10.5)
      .fillColor(PDF_COLORS.text)
      .text(title, margin, doc.y, { width: pageW })
    doc.moveDown(0.3)
  }

  /**
   * Grid de pares `label: value` — dos columnas para aprovechar el ancho
   * de página. Cada par se imprime como etiqueta pequeña en gris + valor
   * en negro.
   */
  private renderFieldGrid(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    rows: Array<{ label: string; value: string }>
  ) {
    const colW = pageW / 2
    const rowH = 28

    rows.forEach((row, idx) => {
      const col = idx % 2
      const x = margin + col * colW

      if (col === 0 && idx > 0) {
        doc.y += rowH
      }

      doc
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor(PDF_COLORS.textMuted)
        .text(row.label, x, doc.y, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        })

      doc
        .font(FONT_BOLD)
        .fontSize(9.5)
        .fillColor(PDF_COLORS.text)
        .text(row.value, x, doc.y + 11, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        })

      if (col === 1 || idx === rows.length - 1) {
        doc.y += rowH
      }
    })

    if (rows.length % 2 !== 0) {
      doc.y += rowH
    }
  }

  /**
   * Bloque de texto largo con fondo suave (secciones descripción / involucrados).
   */
  private renderTextBlock(doc: PDFKit.PDFDocument, margin: number, pageW: number, text: string) {
    const pad = 10
    const textW = pageW - pad * 2

    const textH = doc.heightOfString(text, { width: textW, lineGap: 2 }) + pad * 2
    const blockY = doc.y

    doc.save()
    doc
      .roundedRect(margin, blockY, pageW, textH, 4)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .fillAndStroke(PDF_COLORS.subheaderFill, PDF_COLORS.border)
    doc.restore()

    doc
      .font(FONT_REGULAR)
      .fontSize(9.5)
      .fillColor(PDF_COLORS.text)
      .text(text, margin + pad, blockY + pad, {
        width: textW,
        lineGap: 2,
      })

    doc.y = blockY + textH + 4
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Lee el nombre comercial del tenant activo para el encabezado del PDF. */
  private async fetchTradeName(): Promise<string> {
    try {
      const settingService = new SystemSettingService()
      const setting = await settingService.resolveForActiveTenant()
      return setting?.systemSettingTradeName ?? ''
    } catch {
      return ''
    }
  }

  /**
   * Genera un folio único para el documento impreso.
   * Formato: `ETR-{reportId}-{año}-{seq4}`.
   */
  private generateFolio(reportId: number): string {
    const year = DateTime.now().setZone(REPORT_TIMEZONE).year
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `ETR-${reportId}-${year}-${seq}`
  }

  /** Formatea `DateTime` (date) → `dd/MM/aaaa`. */
  private formatDateDmy(value: DateTime | null | undefined): string {
    if (!value) return ''
    return DateTime.isDateTime(value) ? value.toFormat('dd/LL/yyyy') : ''
  }

  /** Formatea `DateTime` (datetime) → `dd/MM/aaaa HH:mm`. */
  private formatDateTimeDmy(value: DateTime | null | undefined): string {
    if (!value) return ''
    return DateTime.isDateTime(value)
      ? value.setZone(REPORT_TIMEZONE).toFormat('dd/LL/yyyy HH:mm')
      : ''
  }
}
