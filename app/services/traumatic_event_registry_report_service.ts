import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import TraumaticEventReport from '#models/traumatic_event_report'
import SystemSettingService from '#services/system_setting_service'
import { ETR_ERROR_CODES } from '../constants/traumatic_event_report_error_codes.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'

// ---------------------------------------------------------------------------
// Constantes de marca (misma paleta que el reporte de lactancia)
// ---------------------------------------------------------------------------

const BRAND_COLORS = {
  primary: '#3D5DC0',
  primarySoft: '#EEF1FB',
  text: '#1F2937',
  textMuted: '#6B7280',
  textLight: '#FFFFFF',
  border: '#D1D5DB',
  borderLight: '#E5E7EB',
  bgZebra: '#F8FAFC',
  bgCard: '#FFFFFF',
  accent: '#0EA5E9',
} as const

const PRODUCT_WORDMARK = 'Valanserh'

const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

const FONTS_DIR_REL = ['..', '..', 'resources', 'fonts'] as const

const REPORT_TIMEZONE = 'America/Mexico_City'

// ---------------------------------------------------------------------------
// Interfaces públicas
// ---------------------------------------------------------------------------

export interface RegistryReportFilters {
  from?: DateTime | null
  to?: DateTime | null
  eventTypeId?: number
  page?: number
  limit?: number
}

export interface RegistryReferralItem {
  traumaticEventReferralId: number
  institutionType: string
  institutionName: string
  referredAt: string | null
}

export interface RegistryExamItem {
  traumaticEventExamId: number
  examType: string
  performedAt: string | null
  performedBy: string
  outcome: string
}

export interface RegistryReportItem {
  traumaticEventReportId: number
  employee: {
    employeeId: number
    employeeCode: string | number | null
    fullName: string
    personFirstname: string | null
    personLastname: string | null
    personSecondLastname: string | null
    personCurp: string | null
  }
  traumaticEventType: {
    traumaticEventTypeId: number
    traumaticEventTypeName: string
  }
  occurredAt: string | null
  referrals: RegistryReferralItem[]
  referralsCount: number
  exams: RegistryExamItem[]
  examsCount: number
}

export interface RegistryReportPaginated {
  data: RegistryReportItem[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
  }
}

// ---------------------------------------------------------------------------
// Función pura exportada (testeable sin BD)
// ---------------------------------------------------------------------------

/**
 * Valida que el rango de fechas del registro sea coherente (from ≤ to).
 * Si no se pasa ninguno de los dos, no hay nada que validar.
 * Lanza `TraumaticEventReportError` con `ETR.VAL.RANGE.001` si from > to.
 */
export function assertRegistryRangeIsCoherent(
  from: DateTime | null | undefined,
  to: DateTime | null | undefined
): void {
  if (!from || !to) return
  if (from.startOf('day') > to.startOf('day')) {
    throw new TraumaticEventReportError(
      'El rango de fechas del registro es inválido: la fecha inicial es posterior a la final.',
      ETR_ERROR_CODES.RANGE_INVALID,
      400,
      'rango-fechas-invalido'
    )
  }
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/**
 * Servicio del registro auditable de eventos traumáticos (NOM-035 §5.8.c).
 *
 * Consolida reportes de evento con sus canalizaciones y exámenes para
 * la inspección STPS. No persiste nada; solo lee.
 */
export default class TraumaticEventRegistryReportService {
  /**
   * Lista paginada del registro. La paginación se resuelve en SQL.
   */
  async getRegistryPaginated(
    filters: RegistryReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<RegistryReportPaginated> {
    const page = filters.page && filters.page > 0 ? filters.page : 1
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50

    this.assertRangeIsCoherent(filters.from ?? null, filters.to ?? null)

    if (allowedBusinessUnitIds.length === 0) {
      return this.emptyPagination(page, limit)
    }

    const query = this.buildBaseQuery(filters, allowedBusinessUnitIds)
    const paginator = await query
      .orderBy('traumatic_event_report_occurred_at', 'desc')
      .orderBy('traumatic_event_report_id', 'desc')
      .paginate(page, limit)

    const reports = paginator.all()
    const items = await this.hydrateItems(reports)

    return {
      data: items,
      meta: {
        total: paginator.total,
        perPage: paginator.perPage,
        currentPage: paginator.currentPage,
        lastPage: paginator.lastPage,
        firstPage: 1,
      },
    }
  }

  /**
   * Listado completo sin paginar para el export PDF (tope técnico: 5000 filas).
   */
  async getRegistryAll(
    filters: RegistryReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<RegistryReportItem[]> {
    this.assertRangeIsCoherent(filters.from ?? null, filters.to ?? null)

    if (allowedBusinessUnitIds.length === 0) return []

    const query = this.buildBaseQuery(filters, allowedBusinessUnitIds)
    const reports = await query
      .orderBy('traumatic_event_report_occurred_at', 'desc')
      .orderBy('traumatic_event_report_id', 'desc')
      .limit(5000)

    return this.hydrateItems(reports)
  }

  /**
   * Genera el PDF del registro auditable. Devuelve Buffer para que el
   * controller lo envíe con los headers Content-Type + Content-Disposition.
   * No persiste en disco.
   */
  async buildRegistryPdf(
    filters: RegistryReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<Buffer> {
    const items = await this.getRegistryAll(filters, allowedBusinessUnitIds)
    return this.renderPdf(items, filters)
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  private buildBaseQuery(filters: RegistryReportFilters, allowedBusinessUnitIds: number[]) {
    const query = TraumaticEventReport.query()
      .whereNull('traumatic_event_reports.traumatic_event_report_deleted_at')
      .whereHas('employee', (eq) => {
        eq.whereNull('employee_deleted_at').whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .preload('employee', (eq) => eq.preload('person'))
      .preload('traumaticEventType')

    if (filters.from) {
      query.where(
        'traumatic_event_report_occurred_at',
        '>=',
        filters.from.toISODate() as string
      )
    }
    if (filters.to) {
      query.where(
        'traumatic_event_report_occurred_at',
        '<=',
        filters.to.toISODate() as string
      )
    }
    if (filters.eventTypeId) {
      query.where('traumatic_event_type_id', filters.eventTypeId)
    }

    return query
  }

  /**
   * Carga en lote las canalizaciones y exámenes vivos de los reportes
   * dados y los adjunta a cada ítem.
   */
  private async hydrateItems(reports: TraumaticEventReport[]): Promise<RegistryReportItem[]> {
    if (reports.length === 0) return []

    const reportIds = reports.map((r) => r.traumaticEventReportId)

    // Canalizaciones vivas
    const { default: TraumaticEventReferral } = await import(
      '#models/traumatic_event_referral'
    )
    const referralRows = await TraumaticEventReferral.query()
      .whereIn('traumatic_event_report_id', reportIds)
      .whereNull('traumatic_event_referral_deleted_at')
      .orderBy('traumatic_event_referral_referred_at', 'asc')

    const referralsByReport = new Map<number, RegistryReferralItem[]>()
    for (const row of referralRows) {
      const list = referralsByReport.get(row.traumaticEventReportId) ?? []
      list.push({
        traumaticEventReferralId: row.traumaticEventReferralId,
        institutionType: row.traumaticEventReferralInstitutionType,
        institutionName: row.traumaticEventReferralInstitutionName,
        referredAt: this.toIsoDate(row.traumaticEventReferralReferredAt),
      })
      referralsByReport.set(row.traumaticEventReportId, list)
    }

    // Exámenes vivos
    const { default: TraumaticEventExam } = await import('#models/traumatic_event_exam')
    const examRows = await TraumaticEventExam.query()
      .whereIn('traumatic_event_report_id', reportIds)
      .whereNull('traumatic_event_exam_deleted_at')
      .orderBy('traumatic_event_exam_performed_at', 'asc')

    const examsByReport = new Map<number, RegistryExamItem[]>()
    for (const row of examRows) {
      const list = examsByReport.get(row.traumaticEventReportId) ?? []
      list.push({
        traumaticEventExamId: row.traumaticEventExamId,
        examType: row.traumaticEventExamType,
        performedAt: this.toIsoDate(row.traumaticEventExamPerformedAt),
        performedBy: row.traumaticEventExamPerformedBy,
        outcome: row.traumaticEventExamOutcome,
      })
      examsByReport.set(row.traumaticEventReportId, list)
    }

    return reports.map((report) => {
      const employee = report.employee
      const person = employee?.person ?? null
      const fullName = this.composeFullName(employee, person)
      const referrals = referralsByReport.get(report.traumaticEventReportId) ?? []
      const exams = examsByReport.get(report.traumaticEventReportId) ?? []
      const type = report.traumaticEventType

      return {
        traumaticEventReportId: report.traumaticEventReportId,
        employee: {
          employeeId: employee?.employeeId ?? report.employeeId,
          employeeCode: employee?.employeeCode ?? null,
          fullName,
          personFirstname: person?.personFirstname ?? null,
          personLastname: person?.personLastname ?? null,
          personSecondLastname: person?.personSecondLastname ?? null,
          personCurp: person?.personCurp ?? null,
        },
        traumaticEventType: {
          traumaticEventTypeId: type?.traumaticEventTypeId ?? report.traumaticEventTypeId,
          traumaticEventTypeName: type?.traumaticEventTypeName ?? '—',
        },
        occurredAt: this.toIsoDate(report.traumaticEventReportOccurredAt),
        referrals,
        referralsCount: referrals.length,
        exams,
        examsCount: exams.length,
      }
    })
  }

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------

  private async renderPdf(
    items: RegistryReportItem[],
    filters: RegistryReportFilters
  ): Promise<Buffer> {
    const tradeName = await this.fetchTradeName()
    const folio = this.generateFolio()
    const generatedAt = DateTime.now().setZone(REPORT_TIMEZONE)

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 70, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: 'Registro de eventos traumáticos — NOM-035 §5.8.c',
          Author: tradeName || PRODUCT_WORDMARK,
          Subject: 'Traumatic Events Registry Report - NOM-035',
          Creator: PRODUCT_WORDMARK,
          Producer: 'PDFKit',
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

      this.renderFirstPageHeader(doc, tradeName, folio, generatedAt, filters)
      this.renderLegalFoundation(doc)
      this.renderSummaryCounters(doc, items)

      if (items.length === 0) {
        this.renderEmptyState(doc)
      } else {
        for (const item of items) {
          this.renderEmployeeCard(doc, item)
        }
        this.renderSummaryTable(doc, items)
      }

      const pageRange = doc.bufferedPageRange()
      const totalPages = pageRange.count
      for (let i = pageRange.start; i < pageRange.start + totalPages; i++) {
        doc.switchToPage(i)
        const pageIndex = i - pageRange.start
        this.renderBrandStrip(doc, tradeName)
        this.renderPageFooter(doc, folio, generatedAt, pageIndex + 1, totalPages)
      }

      doc.end()
    })
  }

  // ---------------------------------------------------------------------------
  // Bloques visuales del PDF
  // ---------------------------------------------------------------------------

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

  private renderFirstPageHeader(
    doc: PDFKit.PDFDocument,
    tradeName: string,
    folio: string,
    generatedAt: DateTime,
    filters: RegistryReportFilters
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    doc.y = doc.page.margins.top + 8

    doc
      .font('Mulish-Bold')
      .fontSize(18)
      .fillColor(BRAND_COLORS.primary)
      .text('Registro de eventos traumáticos — NOM-035 §5.8.c', margin, doc.y, {
        width: pageW,
        align: 'left',
      })

    doc.moveDown(0.3)
    const metaLeft = tradeName || 'Empresa sin nombre comercial configurado'
    doc
      .font('Mulish')
      .fontSize(10)
      .fillColor(BRAND_COLORS.text)
      .text(`${metaLeft}   Folio: ${folio}`, margin, doc.y, {
        width: pageW,
        align: 'left',
        lineBreak: false,
      })

    doc.moveDown(0.15)
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        `Generado: ${generatedAt.toFormat('dd/LL/yyyy HH:mm')} (CDMX)`,
        margin,
        doc.y,
        { width: pageW, align: 'left', lineBreak: false }
      )

    doc.moveDown(0.4)
    doc
      .font('Mulish-SemiBold')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.text)
      .text(`Filtros aplicados: ${this.formatFilters(filters)}`, margin, doc.y, {
        width: pageW,
        align: 'left',
      })

    doc.moveDown(0.6)
  }

  private renderLegalFoundation(doc: PDFKit.PDFDocument) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2

    doc
      .font('Mulish-Bold')
      .fontSize(11)
      .fillColor(BRAND_COLORS.primary)
      .text('Fundamento legal', margin, doc.y, { width: pageW, align: 'left' })

    doc.moveDown(0.2)
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.text)
      .text(
        'NOM-035-STPS-2018, numeral 5.8.c. El patrón debe conservar el registro de los ' +
          'trabajadores que vivieron acontecimientos traumáticos severos y fueron sujetos ' +
          'a exámenes, disponible en todo momento para la STPS. Este documento consolida ' +
          'los reportes de evento traumático registrados con sus canalizaciones y exámenes ' +
          'practicados, tal como exige la norma.',
        margin,
        doc.y,
        { width: pageW, align: 'left', lineGap: 1 }
      )

    doc.moveDown(0.8)
  }

  private renderSummaryCounters(doc: PDFKit.PDFDocument, items: RegistryReportItem[]) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const startY = doc.y
    const blockW = pageW / 3

    const totalReferrals = items.reduce((s, i) => s + i.referralsCount, 0)
    const totalExams = items.reduce((s, i) => s + i.examsCount, 0)

    const blocks = [
      { value: items.length, label: 'eventos registrados', color: BRAND_COLORS.primary },
      { value: totalReferrals, label: 'canalizaciones', color: BRAND_COLORS.accent },
      { value: totalExams, label: 'exámenes practicados', color: BRAND_COLORS.accent },
    ]

    blocks.forEach((block, idx) => {
      const x = margin + blockW * idx
      doc
        .font('Mulish-Bold')
        .fontSize(28)
        .fillColor(block.color)
        .text(String(block.value), x, startY, { width: blockW, align: 'center', lineBreak: false })
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.textMuted)
        .text(block.label, x, startY + 32, { width: blockW, align: 'center', lineBreak: false })
    })

    doc.y = startY + 56
  }

  private renderEmployeeCard(doc: PDFKit.PDFDocument, item: RegistryReportItem) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const innerPad = 12

    // Estimación conservadora: 26px por viñeta (dos líneas posibles a 9pt ≈ 13px c/u)
    // El bloque real puede ser menor, pero nunca desborda la tarjeta dibujada.
    const referralsBlockH = item.referrals.length > 0 ? 18 + item.referrals.length * 26 : 20
    const examsBlockH = item.exams.length > 0 ? 18 + item.exams.length * 26 : 20
    const cardH = 28 + 18 + 14 + referralsBlockH + examsBlockH + innerPad * 2 + 12

    if (doc.y + cardH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    const x = margin
    const y = doc.y
    const innerX = x + innerPad
    const innerW = pageW - innerPad * 2

    doc.save()
    doc
      .roundedRect(x, y, pageW, cardH, 6)
      .lineWidth(0.7)
      .strokeColor(BRAND_COLORS.borderLight)
      .fillAndStroke(BRAND_COLORS.bgCard, BRAND_COLORS.borderLight)
    doc.rect(x, y, 3.5, cardH).fill(BRAND_COLORS.primary)
    doc.restore()

    // Cabecera: nombre del empleado
    doc
      .font('Mulish-Bold')
      .fontSize(13)
      .fillColor(BRAND_COLORS.text)
      .text(item.employee.fullName, innerX, y + innerPad, {
        width: innerW - 140,
        lineBreak: false,
        ellipsis: true,
      })

    // Tipo de evento alineado a la derecha
    doc
      .font('Mulish-SemiBold')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.primary)
      .text(item.traumaticEventType.traumaticEventTypeName, x + pageW - 140 - innerPad, y + innerPad + 2, {
        width: 140,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      })

    // Meta: CURP | Código | Fecha de ocurrencia
    const metaY = y + innerPad + 22
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        item.employee.personCurp ? `CURP: ${item.employee.personCurp}` : 'CURP: no registrado',
        innerX,
        metaY,
        { width: innerW / 2, lineBreak: false, ellipsis: true }
      )
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        `Fecha de ocurrencia: ${this.formatDateDmy(item.occurredAt)}`,
        innerX + innerW / 2,
        metaY,
        { width: innerW / 2, align: 'right', lineBreak: false, ellipsis: true }
      )

    // Código de empleado
    doc
      .font('Mulish')
      .fontSize(9)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        item.employee.employeeCode ? `Cód. empleado: ${item.employee.employeeCode}` : '',
        innerX,
        metaY + 14,
        { width: innerW, lineBreak: false }
      )

    // Canalizaciones
    const refY = metaY + 30
    doc
      .font('Mulish-Bold')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.primary)
      .text(`Canalizaciones (${item.referralsCount})`, innerX, refY, {
        width: innerW / 2,
        lineBreak: false,
      })

    if (item.referrals.length === 0) {
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.textMuted)
        .text('Sin canalizaciones registradas', innerX, refY + 13, { width: innerW / 2, lineBreak: false })
    } else {
      const colW = innerW / 2 - 8
      let bulletY = refY + 14
      doc.font('Mulish').fontSize(9)
      for (const ref of item.referrals) {
        const bulletText = `• ${this.institutionTypeLabel(ref.institutionType)}: ${ref.institutionName} (${this.formatDateDmy(ref.referredAt)})`
        const lineH = doc.heightOfString(bulletText, { width: colW })
        doc
          .fillColor(BRAND_COLORS.text)
          .text(bulletText, innerX, bulletY, { width: colW })
        bulletY += lineH + 3
      }
    }

    // Exámenes
    const examStartX = innerX + innerW / 2
    doc
      .font('Mulish-Bold')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.primary)
      .text(`Exámenes (${item.examsCount})`, examStartX, refY, {
        width: innerW / 2,
        lineBreak: false,
      })

    if (item.exams.length === 0) {
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.textMuted)
        .text('Sin exámenes registrados', examStartX, refY + 14, { width: innerW / 2, lineBreak: false })
    } else {
      const examColW = innerW / 2 - 8
      let examBulletY = refY + 14
      doc.font('Mulish').fontSize(9)
      for (const exam of item.exams) {
        const examText = `• ${this.examTypeLabel(exam.examType)} — ${this.outcomeLabel(exam.outcome)} (${this.formatDateDmy(exam.performedAt)})`
        const lineH = doc.heightOfString(examText, { width: examColW })
        doc
          .fillColor(BRAND_COLORS.text)
          .text(examText, examStartX, examBulletY, { width: examColW })
        examBulletY += lineH + 3
      }
    }

    doc.y = y + cardH + 10
  }

  private renderSummaryTable(doc: PDFKit.PDFDocument, items: RegistryReportItem[]) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const headerH = 22
    const rowH = 22
    const estimatedH = 28 + headerH + rowH * items.length

    if (doc.y + estimatedH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    } else {
      doc.moveDown(0.4)
    }

    doc
      .font('Mulish-Bold')
      .fontSize(12)
      .fillColor(BRAND_COLORS.primary)
      .text('Resumen tabular', margin, doc.y, { width: pageW, align: 'left' })
    doc.moveDown(0.3)

    const colWeights = [0.3, 0.22, 0.18, 0.15, 0.15]
    const colWidths = colWeights.map((w) => w * pageW)
    const headers = ['Empleado', 'Tipo de evento', 'Fecha ocurrencia', 'Canalizaciones', 'Exámenes']

    let y = doc.y
    doc.save()
    doc.rect(margin, y, pageW, headerH).fill(BRAND_COLORS.primary)
    doc.restore()

    let x = margin
    headers.forEach((header, i) => {
      doc
        .font('Mulish-Bold')
        .fontSize(8.5)
        .fillColor(BRAND_COLORS.textLight)
        .text(header, x + 6, y + 7, {
          width: colWidths[i] - 12,
          align: i >= 3 ? 'center' : 'left',
          lineBreak: false,
        })
      x += colWidths[i]
    })

    y += headerH

    items.forEach((item, idx) => {
      if (y + rowH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        y = doc.page.margins.top + 8
      }
      if (idx % 2 === 1) {
        doc.save()
        doc.rect(margin, y, pageW, rowH).fill(BRAND_COLORS.bgZebra)
        doc.restore()
      }

      x = margin
      const row = [
        this.shortName(item.employee),
        item.traumaticEventType.traumaticEventTypeName,
        this.formatDateDmy(item.occurredAt),
        String(item.referralsCount),
        String(item.examsCount),
      ]

      row.forEach((cell, i) => {
        doc
          .font('Mulish')
          .fontSize(9)
          .fillColor(BRAND_COLORS.text)
          .text(cell, x + 4, y + 6, {
            width: colWidths[i] - 8,
            align: i >= 3 ? 'center' : 'left',
            lineBreak: false,
            ellipsis: true,
            height: 14,
          })
        x += colWidths[i]
      })

      y += rowH
    })

    doc
      .moveTo(margin, y)
      .lineTo(margin + pageW, y)
      .lineWidth(0.5)
      .strokeColor(BRAND_COLORS.borderLight)
      .stroke()
    doc.y = y + 6
  }

  private renderEmptyState(doc: PDFKit.PDFDocument) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    doc.moveDown(2)
    doc
      .font('Mulish-Bold')
      .fontSize(13)
      .fillColor(BRAND_COLORS.primary)
      .text('Sin registros en el periodo seleccionado', margin, doc.y, {
        width: pageW,
        align: 'center',
      })
      .moveDown(0.4)
      .font('Mulish')
      .fontSize(10)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        'No se encontraron eventos traumáticos que cumplan con los filtros aplicados. Ajusta los filtros y vuelve a generar el reporte.',
        margin,
        doc.y,
        { width: pageW, align: 'center' }
      )
  }

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
      .strokeColor(BRAND_COLORS.borderLight)
      .stroke()

    doc
      .font('Mulish')
      .fontSize(7.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        `Folio ${folio} · Generado ${generatedAt.toFormat('dd/LL/yyyy HH:mm')} (CDMX)`,
        margin,
        bottomY + 8,
        { width: pageW / 2, align: 'left', lineBreak: false, height: 10 }
      )

    doc
      .font('Mulish-Bold')
      .fontSize(7.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(`Página ${currentPage} / ${totalPages}`, margin + pageW / 2, bottomY + 8, {
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

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  private assertRangeIsCoherent(from: DateTime | null, to: DateTime | null) {
    assertRegistryRangeIsCoherent(from, to)
  }

  private composeFullName(employee: any, person: any): string {
    const first = person?.personFirstname ?? employee?.employeeFirstName ?? ''
    const last = person?.personLastname ?? employee?.employeeLastName ?? ''
    const second = person?.personSecondLastname ?? employee?.employeeSecondLastName ?? ''
    const joined = [first, last, second]
      .map((s: string) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
      .join(' ')
    return joined || '—'
  }

  private shortName(employee: RegistryReportItem['employee']): string {
    const last = (employee.personLastname ?? '').trim()
    const second = (employee.personSecondLastname ?? '').trim()
    const first = (employee.personFirstname ?? '').trim()
    if (!last && !second && !first) return employee.fullName || '—'
    const lastBlock = [last, second].filter(Boolean).join(' ')
    if (!first) return lastBlock || employee.fullName
    const tokens = first.split(/\s+/)
    const compact = tokens.length === 1 ? tokens[0] : `${tokens[0]} ${tokens[1].charAt(0)}.`
    return `${lastBlock}, ${compact}`
  }

  private toIsoDate(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) return (value as DateTime).toUTC().toISODate() ?? null
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = DateTime.fromISO(trimmed, { zone: 'utc' })
      return parsed.isValid ? parsed.toISODate() : trimmed.slice(0, 10)
    }
    return null
  }

  private formatDateDmy(iso: string | null | undefined): string {
    if (!iso) return '—'
    const parsed = DateTime.fromISO(iso, { zone: 'utc' })
    return parsed.isValid ? parsed.toFormat('dd/LL/yyyy') : iso
  }

  private formatFilters(filters: RegistryReportFilters): string {
    const parts: string[] = []
    const from = filters.from ? this.formatDateDmy(filters.from.toISODate()) : null
    const to = filters.to ? this.formatDateDmy(filters.to.toISODate()) : null
    if (from || to) {
      parts.push(`rango = ${from ?? 'sin inicio'} a ${to ?? 'sin fin'}`)
    } else {
      parts.push('rango = todos los registros')
    }
    if (filters.eventTypeId) {
      parts.push(`tipo de evento = ID ${filters.eventTypeId}`)
    } else {
      parts.push('tipo de evento = todos')
    }
    return parts.join(' · ')
  }

  private institutionTypeLabel(type: string): string {
    const map: Record<string, string> = {
      imss: 'IMSS',
      company_doctor: 'Médico de empresa',
      private_clinic: 'Clínica privada',
      other: 'Otra institución',
    }
    return map[type] ?? type
  }

  private examTypeLabel(type: string): string {
    return type === 'medical' ? 'Médico' : type === 'psychological' ? 'Psicológico' : type
  }

  private outcomeLabel(outcome: string): string {
    const map: Record<string, string> = {
      fit: 'Apto',
      needs_follow_up: 'Requiere seguimiento',
      referred: 'Canalizado',
    }
    return map[outcome] ?? outcome
  }

  private async fetchTradeName(): Promise<string> {
    try {
      const settingService = new SystemSettingService()
      const setting = await settingService.getActive()
      return setting?.systemSettingTradeName ?? ''
    } catch {
      return ''
    }
  }

  private registerMulishFonts(doc: PDFKit.PDFDocument) {
    try {
      const baseDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        ...FONTS_DIR_REL
      )
      doc.registerFont('Mulish', path.join(baseDir, 'Mulish-Regular.ttf'))
      doc.registerFont('Mulish-Bold', path.join(baseDir, 'Mulish-Bold.ttf'))
      doc.registerFont('Mulish-SemiBold', path.join(baseDir, 'Mulish-SemiBold.ttf'))
      doc.registerFont('Mulish-Italic', path.join(baseDir, 'Mulish-Italic.ttf'))
    } catch {
      doc.registerFont('Mulish', 'Helvetica')
      doc.registerFont('Mulish-Bold', 'Helvetica-Bold')
      doc.registerFont('Mulish-SemiBold', 'Helvetica-Bold')
      doc.registerFont('Mulish-Italic', 'Helvetica-Oblique')
    }
  }

  private generateFolio(): string {
    const year = DateTime.now().setZone(REPORT_TIMEZONE).year
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `ETR-${year}-${seq}`
  }

  private emptyPagination(page: number, limit: number): RegistryReportPaginated {
    return {
      data: [],
      meta: { total: 0, perPage: limit, currentPage: page, lastPage: 1, firstPage: 1 },
    }
  }
}
