import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import db from '@adonisjs/lucid/services/db'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import SystemSettingService from '#services/system_setting_service'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import {
  LACTATION_COMPLIANCE_STATUS,
  LACTATION_COMPLIANCE_STATUS_VALUES,
  LACTATION_EXPIRING_THRESHOLD_DAYS,
  type LactationComplianceStatusValue,
} from '../constants/employee_lactation_compliance_status.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'

/**
 * Paleta de marca **Valanserh** definida en la guía oficial del PDF
 * (HU USRH1780441847121). El primario es `#3D5DC0`; los chips de estado
 * usan verde/ámbar/rojo según norma. NO modificar sin actualizar la guía
 * de DS Valanserh.
 */
const BRAND_COLORS = {
  primary: '#3D5DC0',
  primaryDark: '#2E47A3',
  primarySoft: '#EEF1FB',
  active: '#15803D',
  activeSoft: '#DCFCE7',
  activeBorder: '#86EFAC',
  expiring: '#B45309',
  expiringSoft: '#FEF3C7',
  expiringBorder: '#FCD34D',
  expired: '#B91C1C',
  expiredSoft: '#FEE2E2',
  expiredBorder: '#FCA5A5',
  text: '#1F2937',
  textMuted: '#6B7280',
  textLight: '#FFFFFF',
  noteAmber: '#92400E',
  noteAmberBg: '#FEF3C7',
  noteAmberBorder: '#F59E0B',
  border: '#D1D5DB',
  borderLight: '#E5E7EB',
  bgZebra: '#F8FAFC',
  bgSoft: '#F9FAFB',
  bgCard: '#FFFFFF',
} as const

/**
 * Wordmark del producto. Va a la izquierda en la franja de marca de cada
 * página, tal como pide la guía: "franja primaria + wordmark Valanserh +
 * nombre de la empresa cliente".
 */
const PRODUCT_WORDMARK = 'Valanserh'

/**
 * Leyenda de confidencialidad del pie. Espeja literalmente la guía
 * (página 4, Convenciones de formato). Aparece en TODAS las páginas.
 */
const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

/**
 * Pre-resuelve la ruta al directorio de fuentes para no calcularlo en cada
 * generación. Los TTF deben estar en `resources/fonts/`. Mulish es la
 * fuente oficial del DS Valanserh.
 */
const FONTS_DIR_REL = ['..', '..', 'resources', 'fonts'] as const

/**
 * Filtros aceptados por el reporte de cumplimiento. Coinciden 1-a-1 con el
 * validador `employeeLactationComplianceReportValidator`.
 */
export interface ComplianceReportFilters {
  page?: number
  limit?: number
  status?: LactationComplianceStatusValue
  from?: DateTime | null
  to?: DateTime | null
  employeeId?: number
  /**
   * Si viene, acota el reporte a una sola unidad de negocio. El service
   * valida que esté dentro del `allowedBusinessUnitIds` del usuario; si no
   * lo está, el reporte responde vacío (no hace fallback al scope completo
   * para no exponer datos de otras unidades).
   */
  businessUnitId?: number
}

/**
 * Fila del reporte ya serializada para el cliente. El backend nunca expone
 * las notas del periodo (regla de seguridad: información sensible relativa
 * a maternidad). El conteo de evidencias se entrega como número pelado, sin
 * keys ni nombres de archivo.
 */
/**
 * Mini-shape de evidencia documental que se imprime en la tarjeta de cada
 * empleada del PDF. Sólo expone categoría y fecha — NUNCA el `key` de S3 ni
 * el nombre original (regla de confidencialidad de la guía: "no incluir
 * notas internas del periodo ni rutas de archivo").
 */
export interface ComplianceReportEvidence {
  employeeLactationPeriodEvidenceId: number
  category: 'agreement' | 'birth_support' | 'other' | string
  uploadedAt: string | null
}

export interface ComplianceReportItem {
  employeeLactationPeriodId: number
  employeeId: number
  employee: {
    employeeId: number
    employeeCode: string | number | null
    fullName: string
    personFirstname: string | null
    personLastname: string | null
    personSecondLastname: string | null
    personCurp: string | null
  }
  lactationPeriodStartDate: string | null
  lactationPeriodEndDate: string | null
  lactationPeriodType: string | null
  lactationReductionApplication: string | null
  status: LactationComplianceStatusValue
  /**
   * Días con reducción **ya aplicada hasta hoy**. Cuenta sólo las
   * `shift_exceptions` del periodo con `shift_exceptions_date <= today`.
   * Refleja la prueba de aplicación efectiva al corte de la consulta.
   */
  appliedDaysCount: number
  /**
   * Días con turno asignado en TODO el periodo. Cuenta todas las
   * `shift_exceptions` del periodo (independiente de la fecha). Es el
   * denominador que pide auditoría — "cuántos días vamos a aplicar la
   * reducción según el shift de la empleada". Excluye descansos.
   */
  scheduledDaysInPeriodCount: number
  evidencesCount: number
  evidences: ComplianceReportEvidence[]
  /**
   * Días calendario totales entre `start` y `end` (inclusive). Se conserva
   * como dato bruto del rango, pero **no se usa** como denominador de
   * "días aplicados" porque incluye descansos del shift.
   */
  rangeTotalDays: number
  rangeTotalMonths: number
  daysUntilEnd: number | null
}

/**
 * Resultado paginado del endpoint JSON. Se envuelve en
 * `StandardResponseFormatter.success` bajo la key
 * `employeeLactationComplianceReport`.
 */
export interface ComplianceReportPaginated {
  data: ComplianceReportItem[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
  }
}

/**
 * Zona horaria de referencia del proyecto (CDMX). Coincide con la usada por
 * `EmployeeLactationPeriodService` para evitar drift por timezone al calcular
 * `today` y al comparar contra `employee_lactation_period_end_date` que es
 * un `DATE` puro en BD.
 */
const REPORT_TIMEZONE = 'America/Mexico_City'

/**
 * Servicio del reporte de cumplimiento de periodos de lactancia.
 *
 * Encapsula la lógica de:
 *   - Cálculo en runtime del `status` (activa / por_vencer / vencida) según
 *     `LACTATION_EXPIRING_THRESHOLD_DAYS` y la fecha de hoy en `REPORT_TIMEZONE`.
 *   - Conteo de "días aplicados" leyendo las `shift_exceptions` vivas que
 *     llevan `lactation_period_id` del periodo (probando que la reducción
 *     se aplicó al cómputo de asistencia).
 *   - Conteo de evidencias documentales vivas adjuntas al periodo.
 *   - Multitenancy: filtra siempre por las `business_units` accesibles al
 *     usuario autenticado.
 *   - Generación del paquete PDF de evidencia para inspección STPS, con
 *     cita explícita de los fundamentos legales (LFT art. 170 fracc. II y
 *     IV; NOM-037-STPS-2023 numeral 5.2.h).
 *
 * No persiste nada; sólo lee.
 */
export default class EmployeeLactationComplianceReportService {
  // Sin dependencias inyectadas: el PDF de cumplimiento es un paquete
  // legal mexicano que siempre se entrega en español por contrato (STPS).
  // El JSON paginado tampoco devuelve texto traducible — sólo datos.

  /**
   * Devuelve el listado paginado de periodos con su estado calculado, el
   * conteo de días aplicados y el conteo de evidencias. La paginación se
   * resuelve siempre en SQL (no en memoria) para soportar empresas con
   * miles de periodos.
   *
   * @param filters Filtros validados por VineJS. `page` y `limit` son
   *   requeridos por contrato del controller.
   * @param allowedBusinessUnitIds IDs de business units accesibles para el
   *   usuario autenticado (resueltos por el middleware `businessScope`).
   *   Si está vacío, el reporte devuelve siempre cero filas.
   */
  async getCompliancePaginated(
    filters: ComplianceReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<ComplianceReportPaginated> {
    const page = filters.page && filters.page > 0 ? filters.page : 1
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50

    this.assertRangeIsCoherent(filters.from ?? null, filters.to ?? null)

    const effectiveScope = this.resolveEffectiveScope(filters, allowedBusinessUnitIds)
    if (effectiveScope.length === 0) {
      return this.emptyPagination(page, limit)
    }

    const today = this.todayInZone()
    const query = this.buildBaseQuery(filters, effectiveScope, today)

    const paginator = await query
      .orderBy('employee_lactation_period_end_date', 'desc')
      .orderBy('employee_lactation_period_id', 'desc')
      .paginate(page, limit)

    const periods = paginator.all()
    const periodIds = periods.map((p) => p.employeeLactationPeriodId)
    const appliedDaysMap = await this.fetchAppliedDaysCount(periodIds, today)
    const scheduledDaysMap = await this.fetchScheduledDaysInPeriod(periodIds)
    const evidencesByPeriod = await this.fetchEvidencesByPeriod(periodIds)

    return {
      data: periods.map((period) =>
        this.toReportItem(period, appliedDaysMap, scheduledDaysMap, evidencesByPeriod, today)
      ),
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
   * Devuelve el listado COMPLETO (sin paginación) para alimentar el export
   * PDF. Para evitar OOM en empresas grandes mantenemos un tope técnico
   * implícito de 5000 filas en una sola descarga; si se rebasa, el
   * frontend debe filtrar antes (ej. por mes o por departamento).
   */
  async getComplianceAll(
    filters: ComplianceReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<ComplianceReportItem[]> {
    this.assertRangeIsCoherent(filters.from ?? null, filters.to ?? null)

    const effectiveScope = this.resolveEffectiveScope(filters, allowedBusinessUnitIds)
    if (effectiveScope.length === 0) return []

    const today = this.todayInZone()
    const query = this.buildBaseQuery(filters, effectiveScope, today)

    const periods = await query
      .orderBy('employee_lactation_period_end_date', 'desc')
      .orderBy('employee_lactation_period_id', 'desc')
      .limit(5000)

    const periodIds = periods.map((p) => p.employeeLactationPeriodId)
    const appliedDaysMap = await this.fetchAppliedDaysCount(periodIds, today)
    const scheduledDaysMap = await this.fetchScheduledDaysInPeriod(periodIds)
    const evidencesByPeriod = await this.fetchEvidencesByPeriod(periodIds)

    return periods.map((period) =>
      this.toReportItem(period, appliedDaysMap, scheduledDaysMap, evidencesByPeriod, today)
    )
  }

  /**
   * Genera el PDF del paquete de evidencia. Devuelve `Buffer` para que el
   * controller lo envíe con `response.send(buffer)` y los headers
   * `Content-Type: application/pdf` + `Content-Disposition: attachment`.
   *
   * No persiste el PDF en disco — la HU lo exige (información sensible de
   * maternidad), y además mantiene el endpoint apto para streaming.
   */
  async buildCompliancePdf(
    filters: ComplianceReportFilters,
    allowedBusinessUnitIds: number[]
  ): Promise<Buffer> {
    const items = await this.getComplianceAll(filters, allowedBusinessUnitIds)
    return this.renderPdf(items, filters)
  }

  // ---------------------------------------------------------------------------
  // Helpers de query
  // ---------------------------------------------------------------------------

  /**
   * Arma el query base aplicando: multitenant scope, filtros de status
   * (traducidos a condiciones SQL para que la paginación sea exacta),
   * filtros opcionales de rango e employeeId.
   */
  private buildBaseQuery(
    filters: ComplianceReportFilters,
    allowedBusinessUnitIds: number[],
    today: DateTime
  ) {
    const todayIso = today.toISODate() as string
    const expiringFromIso = today
      .plus({ days: LACTATION_EXPIRING_THRESHOLD_DAYS })
      .toISODate() as string

    const query = EmployeeLactationPeriod.query()
      .whereNull('employee_lactation_period_deleted_at')
      .whereHas('employee', (employeeQuery) => {
        employeeQuery
          .whereNull('employee_deleted_at')
          .whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .preload('employee', (employeeQuery) => {
        employeeQuery.preload('person')
      })

    if (filters.employeeId) {
      query.where('employee_id', filters.employeeId)
    }

    // Rango opcional [from, to]: el periodo INTERSECTA el rango si su
    // start <= to y su end >= from. Esto cubre periodos activos durante
    // cualquier parte del rango (típico filtro de "qué pasó en este mes").
    if (filters.from) {
      query.where('employee_lactation_period_end_date', '>=', filters.from.toISODate() as string)
    }
    if (filters.to) {
      query.where('employee_lactation_period_start_date', '<=', filters.to.toISODate() as string)
    }

    if (filters.status === LACTATION_COMPLIANCE_STATUS.EXPIRED) {
      query.where('employee_lactation_period_end_date', '<', todayIso)
    } else if (filters.status === LACTATION_COMPLIANCE_STATUS.EXPIRING) {
      query
        .where('employee_lactation_period_end_date', '>=', todayIso)
        .where('employee_lactation_period_end_date', '<=', expiringFromIso)
    } else if (filters.status === LACTATION_COMPLIANCE_STATUS.ACTIVE) {
      query.where('employee_lactation_period_end_date', '>', expiringFromIso)
    }

    return query
  }

  /**
   * Devuelve un Map<periodId, número de días con reducción aplicada
   * HASTA HOY>. "Día aplicado" = fecha distinta con al menos una
   * `shift_exception` viva ligada al periodo cuya `shift_exceptions_date`
   * sea menor o igual a `today` (zona CDMX).
   *
   * Para periodos vigentes este número va creciendo cada día laboral;
   * para periodos vencidos coincide con `scheduledDaysInPeriodCount`.
   *
   * Usamos `COUNT(DISTINCT shift_exceptions_date)` para que la modalidad
   * `split` (dos excepciones el mismo día: una al inicio y otra al final)
   * cuente como un solo día.
   */
  private async fetchAppliedDaysCount(
    periodIds: number[],
    today: DateTime
  ): Promise<Map<number, number>> {
    if (periodIds.length === 0) return new Map()

    const todayIso = today.toISODate() as string
    const rows = await db
      .from('shift_exceptions')
      .whereIn('lactation_period_id', periodIds)
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exceptions_date', '<=', todayIso)
      .groupBy('lactation_period_id')
      .select(
        'lactation_period_id as periodId',
        db.raw('COUNT(DISTINCT shift_exceptions_date) as appliedDays')
      )

    const map = new Map<number, number>()
    for (const row of rows) {
      map.set(Number(row.periodId), Number(row.appliedDays))
    }
    return map
  }

  /**
   * Devuelve un Map<periodId, número de días con turno asignado en TODO
   * el periodo>. Es el denominador "honesto" del cumplimiento: cuántos
   * días con reducción se van a aplicar a la empleada cuando el periodo
   * termine.
   *
   * Implementación: cuenta fechas distintas con `shift_exception` viva
   * ligada al periodo (sin filtro de fecha). Esto funciona porque
   * `EmployeeLactationPeriodService` genera por adelantado UNA shift
   * exception por cada día con turno del rango — los días de descanso
   * (sin shift) NO generan exception y por eso quedan fuera del conteo.
   */
  private async fetchScheduledDaysInPeriod(
    periodIds: number[]
  ): Promise<Map<number, number>> {
    if (periodIds.length === 0) return new Map()

    const rows = await db
      .from('shift_exceptions')
      .whereIn('lactation_period_id', periodIds)
      .whereNull('shift_exceptions_deleted_at')
      .groupBy('lactation_period_id')
      .select(
        'lactation_period_id as periodId',
        db.raw('COUNT(DISTINCT shift_exceptions_date) as scheduledDays')
      )

    const map = new Map<number, number>()
    for (const row of rows) {
      map.set(Number(row.periodId), Number(row.scheduledDays))
    }
    return map
  }

  /**
   * Devuelve un Map<periodId, ComplianceReportEvidence[]> con la lista de
   * evidencias vivas adjuntas a cada periodo. Sólo expone `id`, `category`
   * y `uploadedAt` — nunca la `Key` de S3 ni el nombre original (regla de
   * confidencialidad de la guía).
   *
   * El frontend obtiene el `count` haciendo `array.length`, así garantizamos
   * que el conteo del JSON y la lista impresa en el PDF SIEMPRE coincidan
   * sin tener que sumar/cruzar dos endpoints.
   */
  private async fetchEvidencesByPeriod(
    periodIds: number[]
  ): Promise<Map<number, ComplianceReportEvidence[]>> {
    if (periodIds.length === 0) return new Map()

    const rows = await db
      .from('employee_lactation_period_evidences')
      .whereIn('employee_lactation_period_id', periodIds)
      .whereNull('employee_lactation_period_evidence_deleted_at')
      .select(
        'employee_lactation_period_evidence_id as id',
        'employee_lactation_period_id as periodId',
        'employee_lactation_period_evidence_category as category',
        'employee_lactation_period_evidence_created_at as createdAt'
      )
      .orderBy('employee_lactation_period_evidence_created_at', 'asc')

    const map = new Map<number, ComplianceReportEvidence[]>()
    for (const row of rows) {
      const periodId = Number(row.periodId)
      const created = row.createdAt
      let uploadedAt: string | null = null
      if (DateTime.isDateTime(created)) {
        uploadedAt = (created as DateTime).toUTC().toISODate() ?? null
      } else if (created instanceof Date) {
        uploadedAt = DateTime.fromJSDate(created).toUTC().toISODate() ?? null
      } else if (typeof created === 'string') {
        uploadedAt = created.slice(0, 10)
      }
      const list = map.get(periodId) ?? []
      list.push({
        employeeLactationPeriodEvidenceId: Number(row.id),
        category: String(row.category ?? 'other'),
        uploadedAt,
      })
      map.set(periodId, list)
    }
    return map
  }

  // ---------------------------------------------------------------------------
  // Mapeo a la fila del reporte
  // ---------------------------------------------------------------------------

  private toReportItem(
    period: EmployeeLactationPeriod,
    appliedDaysMap: Map<number, number>,
    scheduledDaysMap: Map<number, number>,
    evidencesByPeriod: Map<number, ComplianceReportEvidence[]>,
    today: DateTime
  ): ComplianceReportItem {
    const startIso = this.toIsoDate(period.employeeLactationPeriodStartDate)
    const endIso = this.toIsoDate(period.employeeLactationPeriodEndDate)
    const endDate = this.parseIsoDate(endIso)
    const startDate = this.parseIsoDate(startIso)

    const status = this.calculateStatus(endDate, today)
    const daysUntilEnd = endDate ? Math.round(endDate.diff(today, 'days').days) : null
    const rangeTotalDays =
      startDate && endDate ? Math.max(0, Math.round(endDate.diff(startDate, 'days').days) + 1) : 0
    // Duración en meses redondeada — la guía pide "(6 meses)" / "(8 meses)"
    // entre paréntesis junto al rango. Usamos la diferencia exacta en meses
    // y redondeamos al entero más cercano para que coincida con el lenguaje
    // de RH ("se extiende 6 meses tras el parto"), evitando "5.9" o "8.1".
    const rangeTotalMonths =
      startDate && endDate
        ? Math.max(0, Math.round(endDate.diff(startDate, 'months').months))
        : 0

    const employee = period.employee
    const person = employee?.person ?? null
    const fullName = this.composeFullName(employee, person)
    const evidences = evidencesByPeriod.get(period.employeeLactationPeriodId) ?? []

    return {
      employeeLactationPeriodId: period.employeeLactationPeriodId,
      employeeId: period.employeeId,
      employee: {
        employeeId: employee?.employeeId ?? period.employeeId,
        employeeCode: employee?.employeeCode ?? null,
        fullName,
        personFirstname: person?.personFirstname ?? null,
        personLastname: person?.personLastname ?? null,
        personSecondLastname: person?.personSecondLastname ?? null,
        personCurp: person?.personCurp ?? null,
      },
      lactationPeriodStartDate: startIso,
      lactationPeriodEndDate: endIso,
      lactationPeriodType: period.employeeLactationPeriodType ?? null,
      lactationReductionApplication:
        period.employeeLactationPeriodReductionApplication ?? null,
      status,
      appliedDaysCount: appliedDaysMap.get(period.employeeLactationPeriodId) ?? 0,
      scheduledDaysInPeriodCount:
        scheduledDaysMap.get(period.employeeLactationPeriodId) ?? 0,
      evidencesCount: evidences.length,
      evidences,
      rangeTotalDays,
      rangeTotalMonths,
      daysUntilEnd,
    }
  }

  private composeFullName(
    employee?: EmployeeLactationPeriod['employee'] | null,
    person?: EmployeeLactationPeriod['employee']['person'] | null
  ): string {
    const first =
      person?.personFirstname ?? employee?.employeeFirstName ?? ''
    const last = person?.personLastname ?? employee?.employeeLastName ?? ''
    const second =
      person?.personSecondLastname ?? employee?.employeeSecondLastName ?? ''
    const joined = [first, last, second]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
      .join(' ')
    return joined || '—'
  }

  /**
   * Implementa la regla de status:
   *   - end < today                       → vencida
   *   - end - today <= 30 días            → por_vencer
   *   - cualquier otro caso (o sin fecha) → activa
   * El umbral de 30 días vive en `LACTATION_EXPIRING_THRESHOLD_DAYS` para
   * estar alineado con futuras alertas (HU hermana fuera de scope).
   */
  private calculateStatus(
    endDate: DateTime | null,
    today: DateTime
  ): LactationComplianceStatusValue {
    if (!endDate) return LACTATION_COMPLIANCE_STATUS.ACTIVE
    if (endDate < today) return LACTATION_COMPLIANCE_STATUS.EXPIRED
    const daysLeft = endDate.diff(today, 'days').days
    if (daysLeft <= LACTATION_EXPIRING_THRESHOLD_DAYS) {
      return LACTATION_COMPLIANCE_STATUS.EXPIRING
    }
    return LACTATION_COMPLIANCE_STATUS.ACTIVE
  }

  // ---------------------------------------------------------------------------
  // PDF (pdfkit)
  // ---------------------------------------------------------------------------

  /**
   * Renderiza el PDF en memoria según la **Guía de implementación
   * USRH1780441847121** del paquete de evidencia de lactancia. Estructura
   * del documento (todas las páginas comparten franja de marca + footer):
   *
   *   1. **Página 1 (cabecera)**: título, meta de empresa (nombre comercial
   *      + folio + fecha de generación CDMX), filtros aplicados, bloque
   *      "Fundamento legal" y resumen con conteos por estado.
   *   2. **Tarjetas por empleada**: una tarjeta consecutiva por periodo con
   *      CURP, periodo + duración en meses, tipo y modalidad de reducción,
   *      días con reducción aplicada, chip de estado y lista de evidencias
   *      documentales adjuntas. Si la duración supera 6 meses se agrega la
   *      nota ámbar de "política voluntaria" (LFT 170 IV).
   *   3. **Resumen tabular** al final con una fila por empleada.
   *   4. **Encabezado de marca** (franja `#3D5DC0`) y **pie de página**
   *      (folio · fecha · Página X · leyenda de confidencialidad) en
   *      TODAS las páginas, repetidos.
   *
   * El PDF se entrega siempre en español por contrato (paquete legal STPS).
   * No depende del `i18n` del request.
   */
  private async renderPdf(
    items: ComplianceReportItem[],
    filters: ComplianceReportFilters
  ): Promise<Buffer> {
    const tradeName = await this.fetchTradeName()
    const folio = this.generateFolio()
    const generatedAt = DateTime.now().setZone(REPORT_TIMEZONE)
    const summary = this.buildSummary(items)

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        // Margen superior generoso para que la banda de marca (24px) no
        // pise el contenido; el footer reserva ~60px desde el fondo.
        margins: { top: 60, bottom: 70, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: 'Reporte de cumplimiento — Periodos de lactancia',
          Author: tradeName || PRODUCT_WORDMARK,
          Subject: 'Compliance Report - Lactation Periods',
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
      this.renderStatusSummary(doc, summary)

      if (items.length === 0) {
        this.renderEmptyState(doc)
      } else {
        for (const item of items) {
          this.renderEmployeeCard(doc, item)
        }
        this.renderSummaryTable(doc, items)
      }

      // Pintamos la franja de marca y el pie en cada página después de
      // generar todo el contenido (las tarjetas pueden haber añadido
      // páginas extra). `bufferPages: true` nos permite re-visitar.
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
  // Bloques visuales del PDF (alineados con la guía USRH1780441847121)
  // ---------------------------------------------------------------------------

  /**
   * Franja superior de marca. Coincide en todas las páginas: fondo
   * primario `#3D5DC0`, wordmark "Valanserh" a la izquierda y el nombre
   * comercial de la empresa cliente a la derecha.
   *
   * El cursor `doc.y` se restaura al margen superior al terminar para
   * evitar que un `text()` posterior accidentalmente arrastre la
   * coordenada Y y cause overflow → página en blanco extra (defecto
   * crónico de pdfkit con `text()` en coords absolutas cerca del borde).
   */
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
      .text(PRODUCT_WORDMARK, margin, 7, {
        width: pageW / 2 - margin,
        lineBreak: false,
        height: 12,
      })

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

  /**
   * Bloque de cabecera de la primera página (debajo de la franja de marca):
   * título principal, meta del cliente (tradeName · Folio · Generado en
   * CDMX) y los filtros aplicados.
   */
  private renderFirstPageHeader(
    doc: PDFKit.PDFDocument,
    tradeName: string,
    folio: string,
    generatedAt: DateTime,
    filters: ComplianceReportFilters
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2

    doc.y = doc.page.margins.top + 8

    doc
      .font('Mulish-Bold')
      .fontSize(18)
      .fillColor(BRAND_COLORS.primary)
      .text('Reporte de cumplimiento — Periodos de lactancia', margin, doc.y, {
        width: pageW,
        align: 'left',
      })

    doc.moveDown(0.3)
    const metaLeft = tradeName
      ? `${tradeName}`
      : 'Empresa sin nombre comercial configurado'
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

  /**
   * Bloque "Fundamento legal" como exige la guía (primera página). Cita
   * literalmente LFT art. 170 fracc. II y IV y NOM-037 numeral 5.2.h, y
   * resume el propósito del paquete de evidencia.
   */
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
        'Ley Federal del Trabajo, artículo 170, fracciones II y IV · NOM-037-STPS-2023, ' +
          'numeral 5.2.h. Este documento consolida los periodos de lactancia registrados, la ' +
          'modalidad de reducción de jornada acordada con cada trabajadora y la evidencia de ' +
          'su aplicación efectiva en el control de asistencia.',
        margin,
        doc.y,
        { width: pageW, align: 'left', lineGap: 1 }
      )

    doc.moveDown(0.8)
  }

  /**
   * Resumen con conteos por estado (4 conteos en una fila): total de
   * empleadas + activas + por vencer + vencidas. Cada conteo es un número
   * grande en primario con su etiqueta debajo.
   */
  private renderStatusSummary(
    doc: PDFKit.PDFDocument,
    summary: { total: number; active: number; expiring: number; expired: number }
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const startY = doc.y
    const blockW = pageW / 4

    const blocks: Array<{ value: number; label: string; color: string }> = [
      { value: summary.total, label: 'empleadas', color: BRAND_COLORS.primary },
      { value: summary.active, label: 'activas', color: BRAND_COLORS.active },
      { value: summary.expiring, label: 'por vencer', color: BRAND_COLORS.expiring },
      { value: summary.expired, label: 'vencida(s)', color: BRAND_COLORS.expired },
    ]

    blocks.forEach((block, idx) => {
      const x = margin + blockW * idx
      doc
        .font('Mulish-Bold')
        .fontSize(28)
        .fillColor(block.color)
        .text(String(block.value), x, startY, {
          width: blockW,
          align: 'center',
          lineBreak: false,
        })
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.textMuted)
        .text(block.label, x, startY + 32, {
          width: blockW,
          align: 'center',
          lineBreak: false,
        })
    })

    doc.y = startY + 56
  }

  /**
   * Una "tarjeta" por empleada/periodo, alineada con el bloque visual de la
   * página 2 y 3 de la guía: encabezado con nombre + chip de estado, CURP
   * + periodo + duración (meses) en la línea principal, grid de "Tipo /
   * Modalidad", "Días aplicados / Estado" y lista de evidencias. Si la
   * duración del periodo supera 6 meses, agrega la nota ámbar de política
   * voluntaria (LFT 170 IV).
   */
  private renderEmployeeCard(doc: PDFKit.PDFDocument, item: ComplianceReportItem) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const innerPad = 12

    // Estimamos altura de la tarjeta para decidir si requiere salto de
    // página. Cabecera (28) + meta (18) + grid (44) + evidencias (variable
    // según cantidad de items) + padding.
    const evidencesBlockH =
      item.evidences.length > 0 ? 16 + item.evidences.length * 13 : 30
    const cardH = 28 + 18 + 14 + 50 + evidencesBlockH + innerPad * 2

    if (doc.y + cardH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }

    const x = margin
    const y = doc.y
    const innerX = x + innerPad
    const innerW = pageW - innerPad * 2

    // Marco con acento lateral del color del estado.
    doc.save()
    doc
      .roundedRect(x, y, pageW, cardH, 6)
      .lineWidth(0.7)
      .strokeColor(BRAND_COLORS.borderLight)
      .fillAndStroke(BRAND_COLORS.bgCard, BRAND_COLORS.borderLight)
    doc.rect(x, y, 3.5, cardH).fill(this.statusColor(item.status))
    doc.restore()

    // Cabecera: nombre + chip de estado en esquina superior derecha.
    doc
      .font('Mulish-Bold')
      .fontSize(13)
      .fillColor(BRAND_COLORS.text)
      .text(item.employee.fullName, innerX, y + innerPad, {
        width: innerW - 110,
        lineBreak: false,
        ellipsis: true,
      })

    this.drawStatusChip(doc, item.status, x + pageW - 110 - innerPad, y + innerPad - 2, 110, 20)

    // Línea de meta: CURP a la izquierda; periodo (inicio – fin) + meses
    // a la derecha, exactamente como muestra la guía.
    const metaY = y + innerPad + 22
    const periodLine = item.lactationPeriodStartDate
      ? `Periodo ${this.formatDateDmy(item.lactationPeriodStartDate)} – ` +
        `${this.formatDateDmy(item.lactationPeriodEndDate)} ` +
        `(${item.rangeTotalMonths} meses)`
      : 'Periodo no definido'
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(
        item.employee.personCurp
          ? `CURP ${item.employee.personCurp}`
          : 'CURP no registrado',
        innerX,
        metaY,
        { width: innerW / 2, lineBreak: false, ellipsis: true }
      )
    doc
      .font('Mulish')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.textMuted)
      .text(periodLine, innerX + innerW / 2, metaY, {
        width: innerW / 2,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      })

    // Grid 2x2 con "Tipo de reducción / Modalidad" arriba y
    // "Días con reducción aplicada / Estado" abajo.
    const gridY = metaY + 22
    const colW = innerW / 2
    const grid: Array<{ label: string; value: string }> = [
      { label: 'Tipo de reducción', value: this.typeLabelForGuide(item.lactationPeriodType) },
      {
        label: 'Modalidad de aplicación',
        value: this.modalityLabelForGuide(item.lactationReductionApplication, item.lactationPeriodType),
      },
      {
        // Aplicado HASTA HOY / total con turno asignado en el periodo
        // (NO días calendario). Para periodos vencidos ambos coinciden;
        // para vigentes el numerador refleja el avance real al corte.
        label: 'Días con reducción aplicada',
        value: `${item.appliedDaysCount} de ${item.scheduledDaysInPeriodCount} días con turno`,
      },
      { label: 'Estado', value: this.statusLabel(item.status) },
    ]
    grid.forEach((cell, idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const cellX = innerX + colW * col
      const cellY = gridY + row * 22
      doc
        .font('Mulish')
        .fontSize(8)
        .fillColor(BRAND_COLORS.textMuted)
        .text(cell.label, cellX, cellY, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        })
      doc
        .font('Mulish-SemiBold')
        .fontSize(9.5)
        .fillColor(BRAND_COLORS.text)
        .text(cell.value, cellX, cellY + 10, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        })
    })

    // Bloque "Evidencia documental adjunta": viñetas con la categoría
    // legible y la fecha de carga (sólo lo que la guía permite imprimir;
    // NO se imprime nombre original ni clave de S3).
    const evidencesY = gridY + 50
    doc
      .font('Mulish-Bold')
      .fontSize(9.5)
      .fillColor(BRAND_COLORS.primary)
      .text('Evidencia documental adjunta', innerX, evidencesY, {
        width: innerW,
        lineBreak: false,
      })

    if (item.evidences.length === 0) {
      doc
        .font('Mulish')
        .fontSize(9)
        .fillColor(BRAND_COLORS.expiring)
        .text('Pendiente de adjuntar', innerX, evidencesY + 14, {
          width: innerW,
          lineBreak: false,
        })
    } else {
      let bulletY = evidencesY + 14
      for (const ev of item.evidences) {
        doc
          .font('Mulish')
          .fontSize(9)
          .fillColor(BRAND_COLORS.text)
          .text(
            `• ${this.evidenceCategoryLabel(ev.category)} (cargada el ${this.formatDateDmy(ev.uploadedAt)})`,
            innerX,
            bulletY,
            { width: innerW, lineBreak: false, ellipsis: true }
          )
        bulletY += 13
      }
    }

    doc.y = y + cardH + 10
  }

  /**
   * "Resumen tabular" al final, según la guía. Tabla simple con cabecera
   * primaria y filas zebra: Empleada · Periodo · Tipo · Modalidad · Estado
   * · Días aplic.
   */
  private renderSummaryTable(doc: PDFKit.PDFDocument, items: ComplianceReportItem[]) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2

    // La tabla cabe entera en una sola página: si no queda espacio
    // suficiente, saltamos a una nueva.
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

    // Anchos pensados para que cada header quepa en una línea, las
    // fechas dd/MM/yyyy – dd/MM/yyyy del periodo entren completas y las
    // etiquetas de Modalidad/Tipo ("Salida anticipada", "2 reposos") no
    // se corten ni hagan wrap.
    const colWeights = [0.21, 0.24, 0.11, 0.2, 0.12, 0.12]
    const colWidths = colWeights.map((w) => w * pageW)
    const headers = ['Empleada', 'Periodo', 'Tipo', 'Modalidad', 'Estado', 'Días aplic.']

    // Cabecera.
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
          align: i === headers.length - 1 ? 'center' : 'left',
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
        item.lactationPeriodStartDate
          ? `${this.formatDateDmy(item.lactationPeriodStartDate)} – ${this.formatDateDmy(item.lactationPeriodEndDate)}`
          : '—',
        this.typeLabelShort(item.lactationPeriodType),
        this.modalityLabelShort(item.lactationReductionApplication, item.lactationPeriodType),
        this.statusLabel(item.status),
        String(item.appliedDaysCount),
      ]

      row.forEach((cell, i) => {
        const isStatus = i === 4
        const isCount = i === 5
        doc
          .font(isStatus ? 'Mulish-Bold' : 'Mulish')
          .fontSize(9)
          .fillColor(isStatus ? this.statusColor(item.status) : BRAND_COLORS.text)
          .text(cell, x + 4, y + 6, {
            width: colWidths[i] - 8,
            align: isCount ? 'center' : 'left',
            lineBreak: false,
            ellipsis: true,
            height: 14,
          })
        x += colWidths[i]
      })

      y += rowH
    })

    // Línea de cierre.
    doc
      .moveTo(margin, y)
      .lineTo(margin + pageW, y)
      .lineWidth(0.5)
      .strokeColor(BRAND_COLORS.borderLight)
      .stroke()
    doc.y = y + 6
  }

  /**
   * Estado vacío: leyenda en español según la guía cuando los filtros no
   * arrojan registros. Se renderiza en la misma primera página (no se
   * añade tabla ni tarjetas).
   */
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
        'No se encontraron periodos de lactancia que cumplan con los filtros aplicados. Ajusta los filtros y vuelve a generar el reporte.',
        margin,
        doc.y,
        { width: pageW, align: 'center' }
      )
  }

  /**
   * Pie de página fijo: folio + fecha generación + Página X / Y + leyenda
   * de confidencialidad. Se renderiza en TODAS las páginas (incluida la
   * primera), tal como pide la guía.
   *
   * Punto importante de pdfkit: cuando dibujas `text()` en coordenadas
   * absolutas cerca del borde inferior, el engine puede empujar el cursor
   * `doc.y` a `> page.height - bottomMargin` y AÑADIR una página en
   * blanco aunque el contenido ya esté pintado. Para prevenirlo:
   *   1. Cada `text()` lleva `height` explícito (cabe en una línea).
   *   2. Restauramos `doc.y` al margen superior al terminar.
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
    // El margin inferior es 70 (definido en el ctor), así que el footer
    // arranca a `page.height - 60` para tener una franja segura.
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

    // La leyenda es larga; bajamos el tamaño a 6.5pt para que SIEMPRE
    // entre en una sola línea con margen visual.
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
   * Chip "Activa / Por vencer / Vencida" con paleta de semáforo (verde
   * suave · ámbar suave · rojo suave) según la guía. Fondo claro + texto
   * en el color principal: legible y discreto, no compite con la
   * tipografía de la tarjeta.
   */
  private drawStatusChip(
    doc: PDFKit.PDFDocument,
    status: LactationComplianceStatusValue,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const fg = this.statusColor(status)
    const bg = this.statusBgColor(status)
    const border = this.statusBorderColor(status)
    const label = this.statusLabel(status)

    doc.save()
    doc
      .roundedRect(x, y, width, height, 5)
      .lineWidth(0.8)
      .fillAndStroke(bg, border)
    doc
      .font('Mulish-Bold')
      .fontSize(9)
      .fillColor(fg)
      .text(label, x, y + (height - 9) / 2, {
        width,
        align: 'center',
        lineBreak: false,
      })
    doc.restore()
  }

  private statusColor(status: LactationComplianceStatusValue): string {
    if (status === LACTATION_COMPLIANCE_STATUS.ACTIVE) return BRAND_COLORS.active
    if (status === LACTATION_COMPLIANCE_STATUS.EXPIRING) return BRAND_COLORS.expiring
    return BRAND_COLORS.expired
  }

  private statusBgColor(status: LactationComplianceStatusValue): string {
    if (status === LACTATION_COMPLIANCE_STATUS.ACTIVE) return BRAND_COLORS.activeSoft
    if (status === LACTATION_COMPLIANCE_STATUS.EXPIRING) return BRAND_COLORS.expiringSoft
    return BRAND_COLORS.expiredSoft
  }

  private statusBorderColor(status: LactationComplianceStatusValue): string {
    if (status === LACTATION_COMPLIANCE_STATUS.ACTIVE) return BRAND_COLORS.activeBorder
    if (status === LACTATION_COMPLIANCE_STATUS.EXPIRING) return BRAND_COLORS.expiringBorder
    return BRAND_COLORS.expiredBorder
  }

  /**
   * Conteos por estado para la cabecera del reporte. Reutiliza el mismo
   * cálculo que aparece arriba en la página 1 del PDF y se comparte con la
   * lista completa.
   */
  private buildSummary(items: ComplianceReportItem[]) {
    let active = 0
    let expiring = 0
    let expired = 0
    for (const item of items) {
      if (item.status === LACTATION_COMPLIANCE_STATUS.ACTIVE) active++
      else if (item.status === LACTATION_COMPLIANCE_STATUS.EXPIRING) expiring++
      else expired++
    }
    return { total: items.length, active, expiring, expired }
  }

  /**
   * Resume los filtros aplicados en una línea de texto, espejando el
   * formato de la guía: "estado = todos · rango = 01/01/2026 a 31/12/2026
   * · empleada = todas".
   */
  private formatFilters(filters: ComplianceReportFilters): string {
    const parts: string[] = []
    parts.push(
      `estado = ${filters.status ? this.statusLabel(filters.status).toLowerCase() : 'todos'}`
    )
    const from = filters.from ? this.formatDateDmy(filters.from.toISODate()) : null
    const to = filters.to ? this.formatDateDmy(filters.to.toISODate()) : null
    if (from || to) {
      parts.push(`rango = ${from ?? 'sin inicio'} a ${to ?? 'sin fin'}`)
    } else {
      parts.push('rango = todos los registros')
    }
    parts.push(`empleada = ${filters.employeeId ? `ID ${filters.employeeId}` : 'todas'}`)
    return parts.join(' · ')
  }

  /**
   * Lee `systemSettingTradeName` del setting activo del tenant. Es el
   * único dato del SystemSetting que la guía pide imprimir; el logo
   * institucional se reemplazó por el wordmark "Valanserh" de marca de
   * producto.
   */
  private async fetchTradeName(): Promise<string> {
    try {
      const settingService = new SystemSettingService()
      const setting = await settingService.getActive()
      return setting?.systemSettingTradeName ?? ''
    } catch {
      return ''
    }
  }

  /**
   * Registra las cuatro variantes Mulish que usa el PDF (Regular, Bold,
   * SemiBold e Italic). Si por alguna razón los TTF no existen en disco
   * (deploy roto), hace fallback a Helvetica para no caer el render.
   */
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

  /**
   * Genera un folio determinista por request con la forma `LAC-YYYY-XXXX`.
   * `YYYY` = año en CDMX; `XXXX` = secuencia random de 4 dígitos. Para una
   * historia más estricta de auditoría debería persistirse en BD, pero la
   * guía sólo lo trata como identificador del paquete impreso.
   */
  private generateFolio(): string {
    const year = DateTime.now().setZone(REPORT_TIMEZONE).year
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `LAC-${year}-${seq}`
  }

  /** Formatea `YYYY-MM-DD` → `dd/MM/aaaa`. */
  private formatDateDmy(iso: string | null | undefined): string {
    if (!iso) return '—'
    const parsed = DateTime.fromISO(iso, { zone: 'utc' })
    return parsed.isValid ? parsed.toFormat('dd/LL/yyyy') : iso
  }

  private statusLabel(status: LactationComplianceStatusValue): string {
    if (status === LACTATION_COMPLIANCE_STATUS.ACTIVE) return 'Activa'
    if (status === LACTATION_COMPLIANCE_STATUS.EXPIRING) return 'Por vencer'
    return 'Vencida'
  }

  /**
   * Etiqueta del tipo de reducción para las tarjetas (guía página 2):
   * `reduced_hour` → "Reducción de 1 hora"; `two_rest_periods` → "Dos
   * reposos de 30 min".
   */
  private typeLabelForGuide(type: string | null): string {
    if (type === 'two_rest_periods') return 'Dos reposos de 30 min'
    if (type === 'reduced_hour') return 'Reducción de 1 hora'
    return '—'
  }

  /**
   * Versión corta del tipo para la tabla resumen (guía página 3): "1 hora"
   * o "2 reposos" — para no romper el grid al final del documento.
   */
  private typeLabelShort(type: string | null): string {
    if (type === 'two_rest_periods') return '2 reposos'
    if (type === 'reduced_hour') return '1 hora'
    return '—'
  }

  /**
   * Etiqueta de modalidad según la guía. Para `two_rest_periods` la
   * modalidad SIEMPRE es "Reposos intra-jornada (no altera marcaje)",
   * sin importar el valor de `lactationReductionApplication`.
   */
  private modalityLabelForGuide(modality: string | null, type: string | null): string {
    if (type === 'two_rest_periods') return 'Reposos intra-jornada (no altera marcaje)'
    if (modality === 'start') return 'Entrada diferida (+1 h)'
    if (modality === 'end') return 'Salida anticipada (-1 h)'
    if (modality === 'split') return 'Repartida inicio/fin (30 + 30 min)'
    return '—'
  }

  /** Modalidad compacta para la tabla resumen. */
  private modalityLabelShort(modality: string | null, type: string | null): string {
    if (type === 'two_rest_periods') return 'Intra-jornada'
    if (modality === 'start') return 'Entrada diferida'
    if (modality === 'end') return 'Salida anticipada'
    if (modality === 'split') return 'Repartida'
    return '—'
  }

  /**
   * Traduce la categoría de la evidencia a la viñeta que pide la guía.
   * El catálogo es cerrado (`agreement`, `birth_support`, `other`), pero
   * cualquier valor desconocido cae al fallback "Otro documento".
   */
  private evidenceCategoryLabel(category: string): string {
    if (category === 'agreement') return 'Acuerdo patrón-empleada de reducción de jornada'
    if (category === 'birth_support') return 'Acta de nacimiento de la persona menor (sustento del periodo)'
    return 'Otro documento de soporte'
  }

  /**
   * "Apellido, Nombre" compacto para la tabla resumen (guía página 3:
   * "Quezada Ríos, María F."). Si no tenemos apellidos, recurrimos al
   * `fullName` ya compuesto.
   */
  private shortName(employee: ComplianceReportItem['employee']): string {
    const last = (employee.personLastname ?? '').trim()
    const second = (employee.personSecondLastname ?? '').trim()
    const first = (employee.personFirstname ?? '').trim()
    if (!last && !second && !first) return employee.fullName || '—'
    const lastBlock = [last, second].filter(Boolean).join(' ')
    if (!first) return lastBlock || employee.fullName
    const firstTokens = first.split(/\s+/)
    const compactFirst =
      firstTokens.length === 1
        ? firstTokens[0]
        : `${firstTokens[0]} ${firstTokens[1].charAt(0)}.`
    return `${lastBlock}, ${compactFirst}`
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  private assertRangeIsCoherent(from: DateTime | null, to: DateTime | null) {
    if (!from || !to) return
    if (from > to) {
      throw new EmployeeLactationPeriodError(
        'El rango de fechas del reporte es inválido: la fecha inicial es posterior a la final.',
        ELP_ERROR_CODES.DATE_RANGE_INVALID,
        400,
        'lactation-compliance-report-range-invalid'
      )
    }
  }

  /**
   * Resuelve el scope efectivo de business units para la consulta.
   *
   * - Sin `filters.businessUnitId`: usa todas las BUs accesibles por el
   *   usuario (el comportamiento por default del módulo).
   * - Con `filters.businessUnitId` que SÍ está en `allowed`: filtra a esa
   *   sola unidad (respeta el selector del header global del backoffice).
   * - Con `filters.businessUnitId` que NO está en `allowed`: devuelve `[]`
   *   para que el reporte salga vacío (cerramos cualquier intento de
   *   escape multitenant sin caer a "todas las BUs" como fallback).
   */
  private resolveEffectiveScope(
    filters: ComplianceReportFilters,
    allowedBusinessUnitIds: number[]
  ): number[] {
    if (!filters.businessUnitId) return allowedBusinessUnitIds
    if (allowedBusinessUnitIds.includes(filters.businessUnitId)) {
      return [filters.businessUnitId]
    }
    return []
  }

  /** Devuelve `today` truncado al inicio del día en `REPORT_TIMEZONE`. */
  private todayInZone(): DateTime {
    return DateTime.now().setZone(REPORT_TIMEZONE).startOf('day')
  }

  /**
   * Normaliza un valor de columna `@column.date()` a string `YYYY-MM-DD`
   * sin pérdida por timezone. Espeja la lógica usada por
   * `EmployeeLactationPeriodService.toIsoDateString`.
   */
  private toIsoDate(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) {
      return (value as DateTime).toUTC().toISODate() ?? null
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = DateTime.fromISO(trimmed, { zone: 'utc' })
      return parsed.isValid ? parsed.toISODate() : trimmed.slice(0, 10)
    }
    return null
  }

  /**
   * Convierte un `YYYY-MM-DD` a `DateTime` truncado al inicio del día en
   * `REPORT_TIMEZONE` para compararlo de forma consistente contra `today`.
   */
  private parseIsoDate(iso: string | null): DateTime | null {
    if (!iso) return null
    const parsed = DateTime.fromISO(iso, { zone: REPORT_TIMEZONE })
    return parsed.isValid ? parsed.startOf('day') : null
  }

  private emptyPagination(page: number, limit: number): ComplianceReportPaginated {
    return {
      data: [],
      meta: {
        total: 0,
        perPage: limit,
        currentPage: page,
        lastPage: 1,
        firstPage: 1,
      },
    }
  }

  /**
   * Re-exporta el set de status válidos para que el controller pueda usarlo
   * en su Swagger sin importar la constante directamente (DI más limpia).
   */
  static getStatusValues() {
    return LACTATION_COMPLIANCE_STATUS_VALUES
  }
}
