import { DateTime } from 'luxon'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'
import Complaint from '#models/complaint'
import ComplaintCategoryModel from '#models/complaint_category'
import Employee from '#models/employee'
import User from '#models/user'
import ComplaintAttachmentService from '#services/complaint_attachment_service'
import ComplaintStatusHistoryService from '#services/complaint_status_history_service'
import ComplaintNotificationService from '#services/complaint_notification_service'
import ComplaintIdentityRevealService from '#services/complaint_identity_reveal_service'
import ComplaintCategoryService from '#services/complaint_category_service'
import RetentionGuardService from '#services/retention_guard_service'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_FOLIO_PREFIX,
  COMPLAINT_INITIAL_STATUS,
  COMPLAINT_PASSPHRASE_LENGTH,
  COMPLAINT_CATEGORIES,
  type ComplaintCategory,
  type ComplaintStatus,
} from '#constants/complaint'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import type {
  ComplaintAdminResult,
  ComplaintBoardListItem,
  ComplaintCreateResult,
  ComplaintDetailResult,
  ComplaintListFilters,
  ComplaintListResult,
  ComplaintStatusHistoryRow,
  ComplaintStatusResult,
  ConsultComplaintStatusInput,
  CreateComplaintInput,
  PatchComplaintStatusInput,
  RevealComplaintIdentityInput,
  ComplaintRevealIdentityResult,
  ComplaintIdentityRevealAuditRow,
  ComplaintReportCategoryRow,
  ComplaintReportResult,
} from '../interfaces/complaint_interface.js'
import type { ParsedComplaintReportDateRange } from '../helpers/complaint_report_date_range.js'
import { randomStringFromAlphabet } from '../helpers/csprng_string.js'

const PASSPHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Primer dígito del folio nunca es 0 (mismo rango 100000-999999 de siempre). */
const FOLIO_SUFFIX_FIRST_DIGIT_ALPHABET = '123456789'
const FOLIO_SUFFIX_REST_ALPHABET = '0123456789'

const COMPLAINT_RESOLVED_STATUSES: ComplaintStatus[] = ['resuelto', 'cerrado']

type CategoryCountRow = { complaint_category_slug: ComplaintCategory; total: string | number }
type ResolutionRow = {
  resolved_cases_count: string | number
  average_resolution_hours: string | number | null
}

/** Slug de categoría desde la relación precargada (FK al catálogo). */
function complaintCategorySlug(complaint: Complaint): ComplaintCategory {
  return complaint.complaintCategory.complaintCategorySlug as ComplaintCategory
}

/** Serialización admin: nunca expone employeeId ni relaciones de identidad. */
function serializeComplaintAdmin(complaint: Complaint): ComplaintAdminResult {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaintCategorySlug(complaint),
    description: complaint.complaintDescription,
    status: complaint.complaintStatus,
    businessUnitId: complaint.businessUnitId,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
  }
}

function serializeComplaintBoardItem(complaint: Complaint): ComplaintBoardListItem {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaintCategorySlug(complaint),
    status: complaint.complaintStatus,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
  }
}

function serializeComplaintDetail(
  complaint: Complaint,
  history: ComplaintStatusHistoryRow[],
  attachments: ComplaintDetailResult['attachments']
): ComplaintDetailResult {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaintCategorySlug(complaint),
    description: complaint.complaintDescription,
    status: complaint.complaintStatus,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
    history,
    attachments,
  }
}

/**
 * Servicio del buzón de quejas confidencial (NOM-035 8.1.b).
 */
export default class ComplaintService {
  private readonly historyService = new ComplaintStatusHistoryService()
  private readonly attachmentService = new ComplaintAttachmentService()
  private readonly notificationService = new ComplaintNotificationService()
  private readonly identityRevealService = new ComplaintIdentityRevealService()
  private readonly categoryService = new ComplaintCategoryService()

  /**
   * Registra una queja asociada al empleado autenticado.
   * Devuelve folio y passphrase en claro (única vez).
   */
  async create(user: User, input: CreateComplaintInput): Promise<ComplaintCreateResult> {
    await user.load('person')

    if (!user.person?.personId) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_person_not_found',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.PERSON_NOT_FOUND'
      )
    }

    const employee = await Employee.query()
      .where('personId', user.person.personId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_employee_not_found',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND'
      )
    }

    const category = await this.categoryService.findActiveBySlugOrFail(input.category)

    const plainPassphrase = this.generatePassphrase()
    const complaintPassphraseHash = await hash.make(plainPassphrase)
    const complaintFolio = await this.generateUniqueFolio()

    const complaint = await Complaint.create({
      employeeId: employee.employeeId,
      businessUnitId: employee.businessUnitId,
      complaintFolio,
      complaintPassphraseHash,
      complaintCategoryId: category.complaintCategoryId,
      complaintDescription: input.description.trim(),
      complaintStatus: COMPLAINT_INITIAL_STATUS,
    })

    void this.notificationService.notifyOnNewComplaint(complaint.complaintId)

    return {
      folio: complaint.complaintFolio,
      passphrase: plainPassphrase,
      status: complaint.complaintStatus,
      category: category.complaintCategorySlug as ComplaintCategory,
      createdAt: complaint.complaintCreatedAt.toISO()!,
    }
  }

  /**
   * Consulta el estatus de una queja por folio y passphrase, sin re-identificar al empleado.
   */
  async consultStatus(
    input: ConsultComplaintStatusInput,
    i18n: I18n
  ): Promise<ComplaintStatusResult> {
    const complaint = await Complaint.query()
      .where('complaint_folio', input.folio.trim())
      .whereNull('complaint_deleted_at')
      .preload('complaintCategory')
      .first()

    const passphraseValid =
      complaint &&
      (await hash.verify(complaint.complaintPassphraseHash, input.passphrase.trim()))

    if (!passphraseValid) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_status_not_found',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'case-not-found'
      )
    }

    const slug = complaintCategorySlug(complaint!)

    return {
      folio: complaint!.complaintFolio,
      status: complaint!.complaintStatus,
      category: slug,
      categoryLabel: this.categoryService.resolveLabel(slug, i18n),
      createdAt: complaint!.complaintCreatedAt.toISO()!,
      updatedAt: complaint!.complaintUpdatedAt.toISO()!,
    }
  }

  /**
   * Listado paginado para administradores. Filtra por estatus, categoría y scope.
   * No expone datos del empleado reportante.
   */
  async listPaginated(
    filters: ComplaintListFilters,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintListResult> {
    const safePage = Math.max(filters.page ?? 1, 1)
    const safeLimit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const query = Complaint.query()
      .whereNull('complaint_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (builder) => {
        builder.whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (builder) => {
        builder.whereRaw('1 = 0')
      })

    if (filters.status) {
      query.where('complaint_status', filters.status)
    }

    if (filters.category) {
      await this.categoryService.findActiveBySlugOrFail(filters.category)
      query.whereHas('complaintCategory', (builder) => {
        builder.where('complaint_category_slug', filters.category!)
      })
    }

    query.preload('complaintCategory').orderBy('complaint_created_at', 'desc')

    const paginator = await query.paginate(safePage, safeLimit)
    const pendingNewCount = await this.notificationService.countNewPendingComplaints(
      allowedBusinessUnitIds
    )

    return {
      meta: {
        ...paginator.serialize().meta,
        pendingNewCount,
      },
      data: paginator.all().map((row) => serializeComplaintBoardItem(row)),
    }
  }

  /**
   * Detalle de una queja con bitácora y adjuntos, sin identidad del denunciante.
   */
  async getDetailById(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintDetailResult> {
    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    const history = await this.historyService.listByComplaintId(complaint.complaintId)
    const attachments = await this.attachmentService.listByComplaintId(
      complaint.complaintId,
      allowedBusinessUnitIds
    )

    return serializeComplaintDetail(complaint, history, attachments)
  }

  /**
   * Bitácora cronológica inmutable de una queja.
   */
  async listHistoryByComplaintId(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintStatusHistoryRow[]> {
    await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    return this.historyService.listByComplaintId(complaintId)
  }

  /**
   * Transición de estatus con nota obligatoria y registro en bitácora inmutable.
   */
  async transitionStatus(
    complaintId: number,
    input: PatchComplaintStatusInput,
    actorUserId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintAdminResult> {
    const note = input.note?.trim()
    if (!note) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_note_required',
        COMPLAINT_ERROR_CODES.NOTE_REQUIRED,
        422,
        'note-required'
      )
    }

    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    const fromStatus = complaint.complaintStatus
    const toStatus = input.toStatus

    if (fromStatus === toStatus) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_status_unchanged',
        COMPLAINT_ERROR_CODES.VAL_INPUT,
        422,
        'status-unchanged'
      )
    }

    await db.transaction(async (trx) => {
      complaint.useTransaction(trx)
      complaint.complaintStatus = toStatus
      await complaint.save()

      await this.historyService.appendEntry(
        {
          complaintId: complaint.complaintId,
          fromStatus,
          toStatus,
          note,
          actorUserId,
        },
        trx
      )
    })

    await complaint.refresh()
    await complaint.load('complaintCategory')
    return serializeComplaintAdmin(complaint)
  }

  /**
   * Revela la identidad del denunciante y registra un asiento inmutable de auditoría.
   * La identidad solo se devuelve en esta operación; nunca en listado ni detalle.
   */
  async revealIdentity(
    complaintId: number,
    input: RevealComplaintIdentityInput,
    actorUserId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintRevealIdentityResult> {
    const justification = input.justification?.trim()
    if (!justification) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_justification_required',
        COMPLAINT_ERROR_CODES.JUSTIFICATION_REQUIRED,
        422,
        'justification-required'
      )
    }

    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    const identity = await this.identityRevealService.loadReporterIdentity(complaint.employeeId)

    if (!identity) {
      throw ComplaintServiceError.withMessageKey(
        'complaint_reporter_not_found',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404,
        'reporter-not-found'
      )
    }

    const audit = await this.identityRevealService.appendAudit({
      complaintId: complaint.complaintId,
      revealedByUserId: actorUserId,
      justification,
    })

    return {
      complaintId: complaint.complaintId,
      folio: complaint.complaintFolio,
      identity,
      audit: {
        complaintIdentityRevealAuditId: audit.complaintIdentityRevealAuditId,
        justification: audit.complaintIdentityRevealAuditJustification,
        revealedByUserId: audit.revealedByUserId,
        createdAt: audit.complaintIdentityRevealAuditCreatedAt.toISO()!,
      },
    }
  }

  /**
   * Historial cronológico de revelaciones de identidad de una queja.
   */
  async listRevealHistory(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintIdentityRevealAuditRow[]> {
    await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    return this.identityRevealService.listByComplaintId(complaintId)
  }

  /**
   * Reporte agregado STPS por periodo. Solo métricas; nunca identidades.
   */
  async buildAggregatedReport(
    period: ParsedComplaintReportDateRange,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintReportResult> {
    if (allowedBusinessUnitIds.length === 0) {
      return await this.emptyAggregatedReport(period)
    }

    const fromSql = period.from.toSQL({ includeOffset: false })!
    const toSql = period.to.toSQL({ includeOffset: false })!

    const [byCategory, resolution] = await Promise.all([
      this.fetchReportCategoryCounts(allowedBusinessUnitIds, fromSql, toSql),
      this.fetchReportResolutionMetrics(allowedBusinessUnitIds, fromSql, toSql),
    ])

    const totalVolume = byCategory.reduce((sum, row) => sum + row.count, 0)

    return {
      period: { from: period.fromIso, to: period.toIso },
      totalVolume,
      byCategory,
      averageResolutionTimeHours: resolution.averageResolutionTimeHours,
      resolvedCasesCount: resolution.resolvedCasesCount,
    }
  }

  async buildReportExcel(report: ComplaintReportResult, i18n?: I18n): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(
      this.reportLabel(i18n, 'complaint_report_sheet_name', 'Reporte')
    )

    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_export_title', 'Reporte agregado — Buzón de quejas'),
    ])
    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_period_label', 'Periodo'),
      `${report.period.from} — ${report.period.to}`,
    ])
    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_total_volume_label', 'Volumen total'),
      report.totalVolume,
    ])
    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_avg_resolution_label', 'Tiempo promedio de resolución (horas)'),
      report.averageResolutionTimeHours ??
        this.reportLabel(i18n, 'complaint_report_not_applicable', 'N/A'),
    ])
    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_resolved_cases_label', 'Casos resueltos/cerrados en el periodo'),
      report.resolvedCasesCount,
    ])
    worksheet.addRow([])

    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_by_category_title', 'Desglose por categoría'),
    ])
    worksheet.addRow([
      this.reportLabel(i18n, 'complaint_report_category_column', 'Categoría'),
      this.reportLabel(i18n, 'complaint_report_count_column', 'Conteo'),
    ])
    for (const row of report.byCategory) {
      worksheet.addRow([this.reportCategoryLabel(row.category, i18n), row.count])
    }

    worksheet.getRow(1).font = { bold: true, size: 14 }
    worksheet.columns = [{ width: 42 }, { width: 18 }]

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  async buildReportPdf(report: ComplaintReportResult, i18n?: I18n): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 48, bottom: 48, left: 48, right: 48 },
      })

      const chunks: Uint8Array[] = []
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      doc.on('end', () => {
        const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        const merged = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          merged.set(chunk, offset)
          offset += chunk.length
        }
        resolve(Buffer.from(merged.buffer))
      })
      doc.on('error', reject)

      doc
        .fontSize(16)
        .text(
          this.reportLabel(i18n, 'complaint_report_export_title', 'Reporte agregado — Buzón de quejas')
        )
      doc.moveDown(0.5)
      doc.fontSize(10)
      doc.text(
        `${this.reportLabel(i18n, 'complaint_report_period_label', 'Periodo')}: ${report.period.from} — ${report.period.to}`
      )
      doc.text(
        `${this.reportLabel(i18n, 'complaint_report_total_volume_label', 'Volumen total')}: ${report.totalVolume}`
      )
      doc.text(
        `${this.reportLabel(i18n, 'complaint_report_avg_resolution_label', 'Tiempo promedio de resolución (horas)')}: ${
          report.averageResolutionTimeHours ??
          this.reportLabel(i18n, 'complaint_report_not_applicable', 'N/A')
        }`
      )
      doc.text(
        `${this.reportLabel(i18n, 'complaint_report_resolved_cases_label', 'Casos resueltos/cerrados')}: ${report.resolvedCasesCount}`
      )
      doc.moveDown()

      doc
        .fontSize(12)
        .text(this.reportLabel(i18n, 'complaint_report_by_category_title', 'Desglose por categoría'))
      doc.moveDown(0.3)
      doc.fontSize(10)
      for (const row of report.byCategory) {
        doc.text(`• ${this.reportCategoryLabel(row.category, i18n)}: ${row.count}`)
      }

      doc.moveDown()
      doc.fontSize(8).fillColor('#666666').text(
        this.reportLabel(
          i18n,
          'complaint_report_confidentiality_footer',
          'Reporte agregado sin datos identificantes del denunciante (NOM-035).'
        )
      )

      doc.end()
    })
  }

  buildReportExportFilename(report: ComplaintReportResult, format: 'xlsx' | 'pdf'): string {
    const extension = format === 'xlsx' ? 'xlsx' : 'pdf'
    return `reporte-quejas_${report.period.from}_${report.period.to}.${extension}`
  }

  private async emptyAggregatedReport(
    period: ParsedComplaintReportDateRange
  ): Promise<ComplaintReportResult> {
    const catalogSlugs = await this.loadReportCatalogSlugs()
    return {
      period: { from: period.fromIso, to: period.toIso },
      totalVolume: 0,
      byCategory: catalogSlugs.map((category) => ({ category, count: 0 })),
      averageResolutionTimeHours: null,
      resolvedCasesCount: 0,
    }
  }

  /** Quejas activas del periodo y scope multitenant del reporte. */
  private buildPeriodComplaintsQuery(
    allowedBusinessUnitIds: number[],
    fromSql: string,
    toSql: string
  ) {
    return db
      .from('complaints')
      .whereNull('complaint_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .where('complaint_created_at', '>=', fromSql)
      .where('complaint_created_at', '<=', toSql)
  }

  private async fetchReportCategoryCounts(
    allowedBusinessUnitIds: number[],
    fromSql: string,
    toSql: string
  ): Promise<ComplaintReportCategoryRow[]> {
    const rows = (await this.buildPeriodComplaintsQuery(allowedBusinessUnitIds, fromSql, toSql)
      .clone()
      .innerJoin(
        'complaint_categories as cc',
        'cc.complaint_category_id',
        'complaints.complaint_category_id'
      )
      .select('cc.complaint_category_slug as complaint_category_slug')
      .count('* as total')
      .groupBy('cc.complaint_category_slug')) as CategoryCountRow[]

    const catalogSlugs = await this.loadReportCatalogSlugs()
    return this.fillReportCategoryRows(rows, catalogSlugs)
  }

  private async fetchReportResolutionMetrics(
    allowedBusinessUnitIds: number[],
    fromSql: string,
    toSql: string
  ): Promise<{ resolvedCasesCount: number; averageResolutionTimeHours: number | null }> {
    const scopedComplaintIds = this.buildPeriodComplaintsQuery(
      allowedBusinessUnitIds,
      fromSql,
      toSql
    )
      .clone()
      .select('complaint_id')

    const firstResolutionByComplaint = db
      .from('complaint_status_histories as h')
      .innerJoin('complaints as c', 'c.complaint_id', 'h.complaint_id')
      .select('h.complaint_id', 'c.complaint_created_at')
      .select(db.raw('MIN(h.complaint_status_history_created_at) AS first_resolved_at'))
      .whereIn('h.complaint_status_history_to_status', COMPLAINT_RESOLVED_STATUSES)
      .whereIn('h.complaint_id', scopedComplaintIds)
      .groupBy('h.complaint_id', 'c.complaint_created_at')

    const row = (await db
      .from(firstResolutionByComplaint.as('r'))
      .select(
        db.raw('COUNT(*) AS resolved_cases_count'),
        db.raw(
          'AVG(TIMESTAMPDIFF(HOUR, r.complaint_created_at, r.first_resolved_at)) AS average_resolution_hours'
        )
      )
      .first()) as ResolutionRow | undefined

    return this.parseResolutionMetrics(row)
  }

  private parseResolutionMetrics(row: ResolutionRow | undefined): {
    resolvedCasesCount: number
    averageResolutionTimeHours: number | null
  } {
    const resolvedCasesCount = Number(row?.resolved_cases_count ?? 0)
    if (resolvedCasesCount === 0) {
      return { resolvedCasesCount: 0, averageResolutionTimeHours: null }
    }

    const averageRaw = row?.average_resolution_hours
    const averageResolutionTimeHours =
      averageRaw === null || averageRaw === undefined
        ? null
        : Math.round(Number(averageRaw) * 100) / 100

    return { resolvedCasesCount, averageResolutionTimeHours }
  }

  private fillReportCategoryRows(
    rows: CategoryCountRow[],
    catalogSlugs: ComplaintCategory[]
  ): ComplaintReportCategoryRow[] {
    const map = new Map(rows.map((row) => [row.complaint_category_slug, Number(row.total)]))
    return catalogSlugs.map((category) => ({
      category,
      count: map.get(category) ?? 0,
    }))
  }

  /** Slugs activos del catálogo para filas del reporte (incluye categorías con conteo 0). */
  private async loadReportCatalogSlugs(): Promise<ComplaintCategory[]> {
    const rows = await ComplaintCategoryModel.query()
      .where('complaintCategoryActive', 1)
      .whereNull('complaint_category_deleted_at')
      .orderBy('complaintCategoryOrder')
      .orderBy('complaintCategoryId')

    if (rows.length > 0) {
      return rows.map((row) => row.complaintCategorySlug as ComplaintCategory)
    }

    return [...COMPLAINT_CATEGORIES]
  }

  private reportCategoryLabel(category: ComplaintCategory, i18n?: I18n): string {
    return this.reportLabel(i18n, `complaint_report_category_${category.replace(/-/g, '_')}`, category)
  }

  private reportLabel(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }

  private async findInScopeOrFail(
    complaintId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<Complaint> {
    if (allowedBusinessUnitIds.length === 0) {
      throw this.complaintNotFoundError()
    }

    const complaint = await Complaint.query()
      .where('complaint_id', complaintId)
      .whereNull('complaint_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .preload('complaintCategory')
      .first()

    if (!complaint) {
      throw this.complaintNotFoundError()
    }

    return complaint
  }

  /**
   * Elimina lógicamente una queja (soft-delete).
   * Solo afecta quejas dentro del scope del usuario; devuelve el registro eliminado.
   */
  async destroy(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintAdminResult> {
    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)

    const guard = new RetentionGuardService()
    await guard.assertCanDelete(
      complaint.businessUnitId,
      'complaint',
      complaint.complaintCreatedAt
    )

    await complaint.delete()
    return serializeComplaintAdmin(complaint)
  }

  private complaintNotFoundError() {
    return ComplaintServiceError.withMessageKey(
      'complaint_not_found',
      COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
      404,
      'complaint-not-found'
    )
  }

  /**
   * CSPRNG (USRH1783115930049): `randomStringFromAlphabet` reemplaza el
   * generador pseudoaleatorio anterior — mismo largo, mismo alfabeto,
   * solo cambia la fuente de aleatoriedad (deja de ser predecible).
   */
  private generatePassphrase(): string {
    return randomStringFromAlphabet(PASSPHRASE_ALPHABET, COMPLAINT_PASSPHRASE_LENGTH)
  }

  private async generateUniqueFolio(): Promise<string> {
    const year = DateTime.utc().year

    for (let attempt = 0; attempt < 8; attempt++) {
      // CSPRNG (USRH1783115930049): mismo rango 100000-999999 de siempre
      // (primer dígito nunca 0), generado con `randomStringFromAlphabet`
      // en vez del generador pseudoaleatorio anterior.
      const suffix =
        randomStringFromAlphabet(FOLIO_SUFFIX_FIRST_DIGIT_ALPHABET, 1) +
        randomStringFromAlphabet(FOLIO_SUFFIX_REST_ALPHABET, 5)
      const folio = `${COMPLAINT_FOLIO_PREFIX}-${year}-${suffix}`
      const existing = await Complaint.query().where('complaint_folio', folio).first()
      if (!existing) {
        return folio
      }
    }

    throw ComplaintServiceError.withMessageKey(
      'complaint_folio_generation_failed',
      COMPLAINT_ERROR_CODES.FOLIO_GENERATION_FAILED,
      500,
      'AUTH.COMPLAINT.FOLIO_GENERATION_FAILED'
    )
  }
}
