import { DateTime } from 'luxon'
import TraumaticEventExam from '#models/traumatic_event_exam'
import type { TraumaticEventExamType, TraumaticEventExamOutcome } from '#models/traumatic_event_exam'
import TraumaticEventReportService from '#services/traumatic_event_report_service'
import { TEX_ERROR_CODES } from '../constants/traumatic_event_exam_error_codes.js'
import { TraumaticEventExamError } from '../exceptions/traumatic_event_exam_error.js'
import RetentionGuardService from '#services/retention_guard_service'

export interface TraumaticEventExamCreatePayload {
  traumaticEventExamType: TraumaticEventExamType
  traumaticEventExamPerformedAt: string | Date | DateTime
  traumaticEventExamPerformedBy: string
  traumaticEventExamOutcome: TraumaticEventExamOutcome
  traumaticEventExamNotes?: string | null
  capturedByUserId: number
}

export type TraumaticEventExamUpdatePayload = Partial<
  Omit<TraumaticEventExamCreatePayload, 'capturedByUserId'>
>

function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (DateTime.isDateTime(value)) return value.toISODate()
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
  if (DateTime.isDateTime(value)) return value.toISO()
  if (value instanceof Date) return DateTime.fromJSDate(value).toISO()
  if (typeof value === 'string') return value
  return null
}

function parseDate(value: string | Date | DateTime): DateTime {
  if (DateTime.isDateTime(value)) {
    const iso = value.toISODate()
    return iso ? DateTime.fromISO(iso, { zone: 'UTC-6' }) : value
  }
  if (value instanceof Date) {
    const iso = DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()
    return iso ? DateTime.fromISO(iso, { zone: 'UTC-6' }) : DateTime.fromJSDate(value)
  }
  const head = String(value).length >= 10 ? String(value).substring(0, 10) : String(value)
  const parsed = DateTime.fromISO(head, { zone: 'UTC-6' })
  if (!parsed.isValid) {
    throw new TraumaticEventExamError(
      'La fecha del examen es inválida.',
      TEX_ERROR_CODES.VAL_INPUT,
      400
    )
  }
  return parsed
}

function serializeExam(exam: TraumaticEventExam) {
  return {
    traumaticEventExamId: exam.traumaticEventExamId,
    traumaticEventReportId: exam.traumaticEventReportId,
    traumaticEventExamType: exam.traumaticEventExamType,
    traumaticEventExamPerformedAt: toIsoDateString(exam.traumaticEventExamPerformedAt),
    traumaticEventExamPerformedBy: exam.traumaticEventExamPerformedBy,
    traumaticEventExamOutcome: exam.traumaticEventExamOutcome,
    traumaticEventExamNotes: exam.traumaticEventExamNotes,
    traumaticEventExamCapturedByUserId: exam.traumaticEventExamCapturedByUserId,
    traumaticEventExamCreatedAt: toIsoDateTimeString(exam.traumaticEventExamCreatedAt),
    traumaticEventExamUpdatedAt: toIsoDateTimeString(exam.traumaticEventExamUpdatedAt),
  }
}

/**
 * Valida que la fecha del examen no sea anterior a la ocurrencia del evento ni
 * futura (comparación a nivel día, zona UTC-6). `now` es inyectable para tests.
 *
 * Función pura exportada: lanza TEX.VAL.DATE.001 / TEX.VAL.DATE.002.
 */
export function assertExamDateWithinEvent(
  performedAt: DateTime,
  occurredAt: DateTime,
  now: DateTime = DateTime.now().setZone('UTC-6')
): void {
  const performedDay = performedAt.startOf('day')
  const occurredDay = parseDate(occurredAt).startOf('day')
  const today = now.startOf('day')

  if (performedDay < occurredDay) {
    throw new TraumaticEventExamError(
      'La fecha del examen no puede ser anterior a la ocurrencia del evento.',
      TEX_ERROR_CODES.DATE_BEFORE_EVENT,
      400,
      'fecha-examen-anterior-al-evento'
    )
  }

  if (performedDay > today) {
    throw new TraumaticEventExamError(
      'La fecha del examen no puede ser una fecha futura.',
      TEX_ERROR_CODES.DATE_FUTURE,
      400,
      'fecha-examen-futura'
    )
  }
}

export default class TraumaticEventExamService {
  private readonly reportService = new TraumaticEventReportService()

  /** Lista los exámenes de un reporte (ordenados por fecha desc). */
  async listByReport(reportId: number, allowedBusinessUnitIds: number[] = []) {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const exams = await TraumaticEventExam.query()
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_exam_deleted_at')
      .orderBy('traumatic_event_exam_performed_at', 'desc')

    return exams.map((row) => serializeExam(row))
  }

  /** Crea un resultado de examen validando scope del padre y la fecha. */
  async create(
    reportId: number,
    payload: TraumaticEventExamCreatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const performedAt = parseDate(payload.traumaticEventExamPerformedAt)
    assertExamDateWithinEvent(performedAt, report.traumaticEventReportOccurredAt)

    const exam = new TraumaticEventExam()
    exam.traumaticEventReportId = reportId
    exam.traumaticEventExamType = payload.traumaticEventExamType
    exam.traumaticEventExamPerformedAt = performedAt
    exam.traumaticEventExamPerformedBy = payload.traumaticEventExamPerformedBy.trim()
    exam.traumaticEventExamOutcome = payload.traumaticEventExamOutcome
    exam.traumaticEventExamNotes = payload.traumaticEventExamNotes?.trim() ?? null
    exam.traumaticEventExamCapturedByUserId = payload.capturedByUserId
    await exam.save()

    return serializeExam(exam)
  }

  /** Edita un resultado de examen. El capturador no se modifica. */
  async update(
    reportId: number,
    examId: number,
    payload: TraumaticEventExamUpdatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)
    const exam = await this.findExamOrFail(reportId, examId)

    if (payload.traumaticEventExamType !== undefined) {
      exam.traumaticEventExamType = payload.traumaticEventExamType
    }
    if (payload.traumaticEventExamPerformedAt !== undefined) {
      const performedAt = parseDate(payload.traumaticEventExamPerformedAt)
      assertExamDateWithinEvent(performedAt, report.traumaticEventReportOccurredAt)
      exam.traumaticEventExamPerformedAt = performedAt
    }
    if (payload.traumaticEventExamPerformedBy !== undefined) {
      exam.traumaticEventExamPerformedBy = payload.traumaticEventExamPerformedBy.trim()
    }
    if (payload.traumaticEventExamOutcome !== undefined) {
      exam.traumaticEventExamOutcome = payload.traumaticEventExamOutcome
    }
    if (payload.traumaticEventExamNotes !== undefined) {
      exam.traumaticEventExamNotes = payload.traumaticEventExamNotes?.trim() ?? null
    }

    await exam.save()
    return serializeExam(exam)
  }

  /** Soft delete de un examen (exige reporte padre vivo y en scope). */
  async destroy(reportId: number, examId: number, allowedBusinessUnitIds: number[] = []) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)
    const exam = await this.findExamOrFail(reportId, examId)

    const guard = new RetentionGuardService()
    await guard.assertCanDelete(
      report.businessUnitId,
      'traumatic_event_exam',
      exam.traumaticEventExamCreatedAt
    )

    await exam.delete()
  }

  private async findExamOrFail(reportId: number, examId: number) {
    const exam = await TraumaticEventExam.query()
      .where('traumatic_event_exam_id', examId)
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_exam_deleted_at')
      .first()

    if (!exam) {
      throw new TraumaticEventExamError(
        'El resultado de examen no existe o no pertenece al reporte indicado.',
        TEX_ERROR_CODES.EXAM_NOT_FOUND,
        404,
        'examen-no-encontrado'
      )
    }
    return exam
  }
}
