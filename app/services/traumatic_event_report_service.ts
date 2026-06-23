import { DateTime } from 'luxon'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventType from '#models/traumatic_event_type'
import Employee from '#models/employee'
import { ETR_ERROR_CODES } from '../constants/traumatic_event_report_error_codes.js'
import { TraumaticEventReportError } from '../exceptions/traumatic_event_report_error.js'

export interface TraumaticEventReportCreatePayload {
  traumaticEventReportEmployeeId: number
  traumaticEventTypeId: number
  traumaticEventReportOccurredAt: string | Date | DateTime
  traumaticEventReportInvolvedPeople: string
  traumaticEventReportDescription: string
  capturedByUserId: number
}

export type TraumaticEventReportUpdatePayload = Partial<
  Omit<TraumaticEventReportCreatePayload, 'capturedByUserId'>
>

export interface TraumaticEventReportListFilters {
  page: number
  limit: number
  search?: string
  employeeId?: number
  traumaticEventTypeId?: number
  dateFrom?: string | Date | DateTime
  dateTo?: string | Date | DateTime
}

/**
 * Convierte cualquier representación de fecha a `YYYY-MM-DD`.
 */
function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (DateTime.isDateTime(value)) return (value as DateTime).toISODate()
  if (value instanceof Date) return DateTime.fromJSDate(value).toISODate()
  if (typeof value === 'string') {
    const head = value.length >= 10 ? value.substring(0, 10) : value
    const parsed = DateTime.fromISO(head)
    return parsed.isValid ? parsed.toISODate() : head
  }
  return null
}

function toIsoDateTimeString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (DateTime.isDateTime(value)) return (value as DateTime).toISO()
  if (value instanceof Date) return DateTime.fromJSDate(value).toISO()
  if (typeof value === 'string') return value
  return null
}

/** Serialización plana del reporte con relaciones embebidas (si cargadas). */
function serializeReport(report: TraumaticEventReport) {
  return {
    traumaticEventReportId: report.traumaticEventReportId,
    employeeId: report.employeeId,
    traumaticEventTypeId: report.traumaticEventTypeId,
    traumaticEventReportOccurredAt: toIsoDateString(report.traumaticEventReportOccurredAt),
    traumaticEventReportElaboratedAt: toIsoDateTimeString(
      report.traumaticEventReportElaboratedAt
    ),
    traumaticEventReportInvolvedPeople: report.traumaticEventReportInvolvedPeople,
    traumaticEventReportDescription: report.traumaticEventReportDescription,
    traumaticEventReportOrigin: report.traumaticEventReportOrigin,
    traumaticEventReportCapturedByUserId: report.traumaticEventReportCapturedByUserId,
    traumaticEventReportCreatedAt: toIsoDateTimeString(report.traumaticEventReportCreatedAt),
    traumaticEventReportUpdatedAt: toIsoDateTimeString(report.traumaticEventReportUpdatedAt),
    employee: report.$preloaded.employee ? report.employee : undefined,
    traumaticEventType: report.$preloaded.traumaticEventType
      ? report.traumaticEventType
      : undefined,
  }
}

/**
 * Convierte entrada de fecha a `DateTime` zona UTC-6. Lanza ETR si inválido.
 */
function parseDate(value: string | Date | DateTime): DateTime {
  if (DateTime.isDateTime(value)) {
    const iso = (value as DateTime).toISODate()
    return iso ? DateTime.fromISO(iso, { zone: 'UTC-6' }) : (value as DateTime)
  }
  if (value instanceof Date) {
    const iso = DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()
    return iso ? DateTime.fromISO(iso, { zone: 'UTC-6' }) : DateTime.fromJSDate(value)
  }
  const head = String(value).length >= 10 ? String(value).substring(0, 10) : String(value)
  const parsed = DateTime.fromISO(head, { zone: 'UTC-6' })
  if (!parsed.isValid) {
    throw new TraumaticEventReportError(
      'La fecha del evento es inválida.',
      ETR_ERROR_CODES.VAL_INPUT,
      400
    )
  }
  return parsed
}

export default class TraumaticEventReportService {
  /**
   * Lista paginada de reportes visibles para el scope del usuario.
   * Filtra por businessUnitIds para aislar multitenant.
   */
  async listPaginated(
    filters: TraumaticEventReportListFilters,
    allowedBusinessUnitIds: number[] = []
  ) {
    const safeLimit = Math.min(Math.max(filters.limit, 1), 500)
    const safePage = Math.max(filters.page, 1)

    const query = TraumaticEventReport.query()
      .whereNull('traumatic_event_report_deleted_at')
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at')
        if (allowedBusinessUnitIds.length > 0) {
          q.whereIn('business_unit_id', allowedBusinessUnitIds)
        } else {
          q.whereRaw('1 = 0')
        }
      })
      .preload('employee')
      .preload('traumaticEventType')

    if (filters.employeeId !== undefined) {
      query.where('employee_id', filters.employeeId)
    }
    if (filters.traumaticEventTypeId !== undefined) {
      query.where('traumatic_event_type_id', filters.traumaticEventTypeId)
    }
    if (filters.dateFrom !== undefined) {
      const from = toIsoDateString(filters.dateFrom)
      if (from) query.where('traumatic_event_report_occurred_at', '>=', from)
    }
    if (filters.dateTo !== undefined) {
      const to = toIsoDateString(filters.dateTo)
      if (to) query.where('traumatic_event_report_occurred_at', '<=', to)
    }
    if (filters.search) {
      const term = `%${filters.search.toUpperCase()}%`
      query.whereHas('employee', (q) => {
        q.whereRaw(
          'UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?',
          [term]
        )
      })
    }

    query.orderBy('traumatic_event_report_occurred_at', 'desc')

    const paginator = await query.paginate(safePage, safeLimit)
    const meta = paginator.serialize().meta

    return {
      meta,
      data: paginator.all().map((row) => serializeReport(row)),
    }
  }

  /**
   * Obtiene un reporte por ID dentro del scope del usuario. 404 si no existe.
   */
  async findById(id: number, allowedBusinessUnitIds: number[] = []) {
    const report = await this.findInScopeOrFail(id, allowedBusinessUnitIds)
    await report.load('employee')
    await report.load('traumaticEventType')
    return serializeReport(report)
  }

  /**
   * Crea el reporte asignando elaboratedAt, origin=rh y capturedByUserId.
   * Valida que la fecha de ocurrencia no sea futura y que el tipo exista y esté activo.
   */
  async create(
    payload: TraumaticEventReportCreatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    await this.ensureEmployeeBelongsToScope(
      payload.traumaticEventReportEmployeeId,
      allowedBusinessUnitIds
    )
    await this.ensureEventTypeValid(payload.traumaticEventTypeId)
    const occurredAt = parseDate(payload.traumaticEventReportOccurredAt)
    this.assertNotFuture(occurredAt)

    const report = new TraumaticEventReport()
    report.employeeId = payload.traumaticEventReportEmployeeId
    report.traumaticEventTypeId = payload.traumaticEventTypeId
    report.traumaticEventReportOccurredAt = occurredAt
    report.traumaticEventReportElaboratedAt = DateTime.now()
    report.traumaticEventReportInvolvedPeople = payload.traumaticEventReportInvolvedPeople.trim()
    report.traumaticEventReportDescription = payload.traumaticEventReportDescription.trim()
    report.traumaticEventReportOrigin = 'rh'
    report.traumaticEventReportCapturedByUserId = payload.capturedByUserId
    await report.save()

    await report.load('employee')
    await report.load('traumaticEventType')
    return serializeReport(report)
  }

  /**
   * Edita campos del reporte. Origen, fecha de elaboración y capturador son inmutables.
   */
  async update(
    id: number,
    payload: TraumaticEventReportUpdatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    const report = await this.findInScopeOrFail(id, allowedBusinessUnitIds)

    if (payload.traumaticEventReportEmployeeId !== undefined) {
      await this.ensureEmployeeBelongsToScope(
        payload.traumaticEventReportEmployeeId,
        allowedBusinessUnitIds
      )
      report.employeeId = payload.traumaticEventReportEmployeeId
    }
    if (payload.traumaticEventTypeId !== undefined) {
      await this.ensureEventTypeValid(payload.traumaticEventTypeId)
      report.traumaticEventTypeId = payload.traumaticEventTypeId
    }
    if (payload.traumaticEventReportOccurredAt !== undefined) {
      const occurredAt = parseDate(payload.traumaticEventReportOccurredAt)
      this.assertNotFuture(occurredAt)
      report.traumaticEventReportOccurredAt = occurredAt
    }
    if (payload.traumaticEventReportInvolvedPeople !== undefined) {
      report.traumaticEventReportInvolvedPeople =
        payload.traumaticEventReportInvolvedPeople.trim()
    }
    if (payload.traumaticEventReportDescription !== undefined) {
      report.traumaticEventReportDescription = payload.traumaticEventReportDescription.trim()
    }

    await report.save()
    await report.load('employee')
    await report.load('traumaticEventType')
    return serializeReport(report)
  }

  /** Soft delete del reporte. */
  async destroy(id: number, allowedBusinessUnitIds: number[] = []) {
    const report = await this.findInScopeOrFail(id, allowedBusinessUnitIds)
    await report.delete()
    return serializeReport(report)
  }

  /**
   * Valida que el reporte exista, esté vivo y dentro del scope del usuario, y
   * devuelve el modelo (para que módulos hijos lean datos como la fecha de
   * ocurrencia sin duplicar la lógica de scope). Lanza ETR.NF.REPORT.001 si no.
   */
  async assertReportInScope(reportId: number, allowedBusinessUnitIds: number[] = []) {
    return this.findInScopeOrFail(reportId, allowedBusinessUnitIds)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async findInScopeOrFail(id: number, allowedBusinessUnitIds: number[]) {
    const report = await TraumaticEventReport.query()
      .where('traumatic_event_report_id', id)
      .whereNull('traumatic_event_report_deleted_at')
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at')
        if (allowedBusinessUnitIds.length > 0) {
          q.whereIn('business_unit_id', allowedBusinessUnitIds)
        } else {
          q.whereRaw('1 = 0')
        }
      })
      .first()

    if (!report) {
      throw new TraumaticEventReportError(
        'El reporte de evento traumático no existe o está fuera del alcance del usuario.',
        ETR_ERROR_CODES.REPORT_NOT_FOUND,
        404,
        'reporte-no-encontrado'
      )
    }
    return report
  }

  /**
   * Verifica que el empleado exista en el scope (datos de baja incluidos,
   * conforme a la decisión de dominio: un evento pudo ocurrir antes de la baja).
   */
  private async ensureEmployeeBelongsToScope(
    employeeId: number,
    allowedBusinessUnitIds: number[]
  ) {
    if (allowedBusinessUnitIds.length === 0) {
      throw new TraumaticEventReportError(
        'No hay unidades de negocio activas para el usuario autenticado.',
        ETR_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404
      )
    }
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .first()

    if (!employee) {
      throw new TraumaticEventReportError(
        'El empleado no existe o no pertenece al alcance del usuario autenticado.',
        ETR_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404,
        'empleado-no-encontrado'
      )
    }
  }

  /** Valida que el tipo de evento exista y esté activo. */
  private async ensureEventTypeValid(typeId: number) {
    const eventType = await TraumaticEventType.query()
      .where('traumatic_event_type_id', typeId)
      .where('traumatic_event_type_active', 1)
      .whereNull('traumatic_event_type_deleted_at')
      .first()

    if (!eventType) {
      throw new TraumaticEventReportError(
        'El tipo de acontecimiento traumático no existe o está inactivo.',
        ETR_ERROR_CODES.INVALID_EVENT_TYPE,
        400,
        'tipo-evento-invalido'
      )
    }
  }

  /** Rechaza fechas de ocurrencia futuras (NOM-035 §6.5: fecha en que ocurrió). */
  private assertNotFuture(date: DateTime) {
    const today = DateTime.now().startOf('day')
    if (date.startOf('day') > today) {
      throw new TraumaticEventReportError(
        'La fecha de ocurrencia no puede ser una fecha futura.',
        ETR_ERROR_CODES.OCCURRED_AT_FUTURE,
        400,
        'fecha-ocurrencia-futura'
      )
    }
  }
}
