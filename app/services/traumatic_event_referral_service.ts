import { DateTime } from 'luxon'
import TraumaticEventReferral from '#models/traumatic_event_referral'
import type { TraumaticEventReferralInstitutionType } from '#models/traumatic_event_referral'
import TraumaticEventReportService from '#services/traumatic_event_report_service'
import { TREF_ERROR_CODES } from '../constants/traumatic_event_referral_error_codes.js'
import { TraumaticEventReferralError } from '../exceptions/traumatic_event_referral_error.js'
import RetentionGuardService from '#services/retention_guard_service'

export interface TraumaticEventReferralCreatePayload {
  traumaticEventReferralInstitutionType: TraumaticEventReferralInstitutionType
  traumaticEventReferralInstitutionName: string
  traumaticEventReferralReferredAt: string | Date | DateTime
  traumaticEventReferralNotes?: string | null
  capturedByUserId: number
}

export type TraumaticEventReferralUpdatePayload = Partial<
  Omit<TraumaticEventReferralCreatePayload, 'capturedByUserId'>
>

/** Convierte cualquier representación de fecha a `YYYY-MM-DD`. */
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

/** Convierte la entrada de fecha a `DateTime` zona UTC-6. Lanza TREF si inválida. */
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
    throw new TraumaticEventReferralError(
      'La fecha de la canalización es inválida.',
      TREF_ERROR_CODES.VAL_INPUT,
      400
    )
  }
  return parsed
}

/**
 * Valida que la fecha de canalización no sea anterior a la ocurrencia del evento
 * ni futura (comparación a nivel día). `now` es inyectable para pruebas; por
 * defecto se toma "hoy" en zona UTC-6 (mismo criterio que el reporte padre).
 *
 * Función pura (sin BD ni efectos): lanza TREF.VAL.DATE.001 / TREF.VAL.DATE.002.
 */
export function assertReferralDateWithinEvent(
  referredAt: DateTime,
  occurredAt: DateTime,
  now: DateTime = DateTime.now().setZone('UTC-6')
): void {
  const referredDay = referredAt.startOf('day')
  const occurredDay = parseDate(occurredAt).startOf('day')
  const today = now.startOf('day')

  if (referredDay < occurredDay) {
    throw new TraumaticEventReferralError(
      'La fecha de canalización no puede ser anterior a la ocurrencia del evento.',
      TREF_ERROR_CODES.DATE_BEFORE_EVENT,
      400,
      'fecha-canalizacion-anterior-al-evento'
    )
  }

  if (referredDay > today) {
    throw new TraumaticEventReferralError(
      'La fecha de canalización no puede ser una fecha futura.',
      TREF_ERROR_CODES.DATE_FUTURE,
      400,
      'fecha-canalizacion-futura'
    )
  }
}

/** Serialización plana de la canalización. */
function serializeReferral(referral: TraumaticEventReferral) {
  return {
    traumaticEventReferralId: referral.traumaticEventReferralId,
    traumaticEventReportId: referral.traumaticEventReportId,
    traumaticEventReferralInstitutionType: referral.traumaticEventReferralInstitutionType,
    traumaticEventReferralInstitutionName: referral.traumaticEventReferralInstitutionName,
    traumaticEventReferralReferredAt: toIsoDateString(referral.traumaticEventReferralReferredAt),
    traumaticEventReferralNotes: referral.traumaticEventReferralNotes,
    traumaticEventReferralCapturedByUserId: referral.traumaticEventReferralCapturedByUserId,
    traumaticEventReferralCreatedAt: toIsoDateTimeString(referral.traumaticEventReferralCreatedAt),
    traumaticEventReferralUpdatedAt: toIsoDateTimeString(referral.traumaticEventReferralUpdatedAt),
  }
}

export default class TraumaticEventReferralService {
  private readonly reportService = new TraumaticEventReportService()

  /**
   * Lista las canalizaciones de un reporte (ordenadas por fecha desc).
   * Valida primero que el reporte padre esté vivo y en scope.
   */
  async listByReport(reportId: number, allowedBusinessUnitIds: number[] = []) {
    await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const referrals = await TraumaticEventReferral.query()
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_referral_deleted_at')
      .orderBy('traumatic_event_referral_referred_at', 'desc')

    return referrals.map((row) => serializeReferral(row))
  }

  /**
   * Crea una canalización para el reporte indicado. Valida scope del padre y la
   * fecha (no anterior a la ocurrencia del evento ni futura).
   */
  async create(
    reportId: number,
    payload: TraumaticEventReferralCreatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)

    const referredAt = parseDate(payload.traumaticEventReferralReferredAt)
    this.assertReferralDate(referredAt, report.traumaticEventReportOccurredAt)

    const referral = new TraumaticEventReferral()
    referral.traumaticEventReportId = reportId
    referral.traumaticEventReferralInstitutionType = payload.traumaticEventReferralInstitutionType
    referral.traumaticEventReferralInstitutionName =
      payload.traumaticEventReferralInstitutionName.trim()
    referral.traumaticEventReferralReferredAt = referredAt
    referral.traumaticEventReferralNotes = payload.traumaticEventReferralNotes?.trim() ?? null
    referral.traumaticEventReferralCapturedByUserId = payload.capturedByUserId
    await referral.save()

    return serializeReferral(referral)
  }

  /**
   * Edita una canalización. El capturador no se modifica. Revalida la fecha si
   * cambia y exige el reporte padre vivo y en scope.
   */
  async update(
    reportId: number,
    referralId: number,
    payload: TraumaticEventReferralUpdatePayload,
    allowedBusinessUnitIds: number[] = []
  ) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)
    const referral = await this.findReferralOrFail(reportId, referralId)

    if (payload.traumaticEventReferralInstitutionType !== undefined) {
      referral.traumaticEventReferralInstitutionType =
        payload.traumaticEventReferralInstitutionType
    }
    if (payload.traumaticEventReferralInstitutionName !== undefined) {
      referral.traumaticEventReferralInstitutionName =
        payload.traumaticEventReferralInstitutionName.trim()
    }
    if (payload.traumaticEventReferralReferredAt !== undefined) {
      const referredAt = parseDate(payload.traumaticEventReferralReferredAt)
      this.assertReferralDate(referredAt, report.traumaticEventReportOccurredAt)
      referral.traumaticEventReferralReferredAt = referredAt
    }
    if (payload.traumaticEventReferralNotes !== undefined) {
      referral.traumaticEventReferralNotes =
        payload.traumaticEventReferralNotes?.trim() ?? null
    }

    await referral.save()
    return serializeReferral(referral)
  }

  /** Soft delete de una canalización (exige reporte padre vivo y en scope). */
  async destroy(reportId: number, referralId: number, allowedBusinessUnitIds: number[] = []) {
    const report = await this.reportService.assertReportInScope(reportId, allowedBusinessUnitIds)
    const referral = await this.findReferralOrFail(reportId, referralId)

    const guard = new RetentionGuardService()
    await guard.assertCanDelete(
      report.businessUnitId,
      'traumatic_event_referral',
      referral.traumaticEventReferralCreatedAt
    )

    await referral.delete()
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async findReferralOrFail(reportId: number, referralId: number) {
    const referral = await TraumaticEventReferral.query()
      .where('traumatic_event_referral_id', referralId)
      .where('traumatic_event_report_id', reportId)
      .whereNull('traumatic_event_referral_deleted_at')
      .first()

    if (!referral) {
      throw new TraumaticEventReferralError(
        'La canalización no existe o no pertenece al reporte indicado.',
        TREF_ERROR_CODES.REFERRAL_NOT_FOUND,
        404,
        'canalizacion-no-encontrada'
      )
    }
    return referral
  }

  /** Valida la fecha de canalización contra la ocurrencia del evento. */
  private assertReferralDate(referredAt: DateTime, occurredAt: DateTime) {
    assertReferralDateWithinEvent(referredAt, occurredAt)
  }
}
