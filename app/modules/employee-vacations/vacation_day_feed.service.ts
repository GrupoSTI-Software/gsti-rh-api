import { DateTime } from 'luxon'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import ShiftException from '#models/shift_exception'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import User from '#models/user'
import VacationAuthorizationSignature from '#models/vacation_authorization_signature'
import UploadService from '#services/upload_service'

/**
 * Vigencia de la URL firmada de cada firma: alcanza para la sesión de la
 * pantalla, que la vuelve a pedir al recargar.
 */
const SIGNATURE_URL_TTL_SECONDS = 60 * 60

export const VACATION_DAY_STATUS = {
  PENDING: 'pending',
  AUTHORIZED: 'authorized',
  REFUSED: 'refused',
  CANCELLED: 'cancelled',
} as const

export type VacationDayStatus = (typeof VACATION_DAY_STATUS)[keyof typeof VACATION_DAY_STATUS]

/** Un dia de vacaciones tal como lo pinta la ficha del empleado. */
export interface VacationDayDto {
  /** Unico en la lista: `day-<id>` o `request-<id>`. */
  key: string
  shiftExceptionId: number | null
  exceptionRequestId: number | null
  /** Dia de vacaciones (yyyy-MM-dd). */
  date: string
  status: VacationDayStatus
  description: string | null
  /** Cuando se pidio; para un dia registrado directo, cuando se registro. */
  requestedAt: string | null
  /** Autorizacion o rechazo: quien y cuando. */
  resolvedAt: string | null
  resolvedByName: string | null
  /** Nota de la empresa al resolver (obligatoria al rechazar). */
  resolutionNote: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  cancelReason: string | null
  evidenceCount: number
  /** URL de la firma de autorizacion, si la hay. */
  signatureUrl: string | null
}

export interface VacationDayFeedInput {
  employeeId: number
  vacationSettingId: number
  /**
   * Rango del periodo. Las solicitudes no tienen periodo hasta que se
   * autorizan: se muestran en el periodo cuyo rango contiene el dia pedido.
   */
  periodStartsAt: string
  periodEndsAt: string
}

/**
 * Los dias de vacaciones de un periodo, vengan de donde vengan.
 *
 * Junta dos fuentes que hasta ahora se miraban por separado: las solicitudes
 * (pendientes o rechazadas) y los dias de calendario (autorizados, o cancelados
 * con su rastro). Una solicitud aceptada no aparece por si misma: la representa
 * el dia que genero, para no contar dos veces lo mismo.
 */
export default class VacationDayFeedService {
  async list(input: VacationDayFeedInput): Promise<VacationDayDto[]> {
    const vacationType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_slug', 'vacation')
      .first()
    if (!vacationType) return []

    const days = await ShiftException.query()
      .withTrashed()
      .where('employee_id', input.employeeId)
      .where('exception_type_id', vacationType.exceptionTypeId)
      .where('vacation_setting_id', input.vacationSettingId)
      .where((query) => {
        query
          .whereNull('shift_exceptions_deleted_at')
          // Solo las bajas con rastro de cancelacion: las anteriores a este
          // cambio no dicen si fueron cancelacion o captura equivocada.
          .orWhereNotNull('shift_exception_cancelled_at')
      })
      .orderBy('shift_exceptions_date', 'asc')

    const requests = await ExceptionRequest.query()
      .where('employee_id', input.employeeId)
      .where('exception_type_id', vacationType.exceptionTypeId)
      .whereIn('exception_request_status', ['pending', 'refused'])
      // `requested_date` es timestamp: el ultimo dia del periodo entra completo
      // con el limite exclusivo del dia siguiente.
      .where('requested_date', '>=', input.periodStartsAt)
      .where(
        'requested_date',
        '<',
        DateTime.fromISO(input.periodEndsAt).plus({ days: 1 }).toISODate() ?? input.periodEndsAt
      )
      .orderBy('requested_date', 'asc')

    const linkedRequestIds = days
      .map((day) => day.exceptionRequestId)
      .filter((id): id is number => typeof id === 'number')
    const linkedRequests = linkedRequestIds.length
      ? await ExceptionRequest.query()
          .withTrashed()
          .whereIn('exception_request_id', linkedRequestIds)
      : []
    const requestById = new Map(linkedRequests.map((row) => [row.exceptionRequestId, row]))

    const dayIds = days.map((day) => day.shiftExceptionId)
    const evidenceCounts = await this.evidenceCounts(dayIds)
    const signatures = await this.signatures(dayIds)

    const names = await this.userNames([
      ...days.flatMap((day) => [
        day.shiftExceptionAuthorizedByUserId,
        day.shiftExceptionCancelledByUserId,
      ]),
      ...linkedRequests.map((row) => row.resolvedByUserId),
      ...requests.map((row) => row.resolvedByUserId),
    ])

    const fromDays = days.map((day): VacationDayDto => {
      const origin = day.exceptionRequestId ? requestById.get(day.exceptionRequestId) : undefined
      const cancelled = day.deletedAt !== null
      const authorizedBy = day.shiftExceptionAuthorizedByUserId ?? origin?.resolvedByUserId ?? null
      const authorizedAt = day.shiftExceptionAuthorizedAt ?? origin?.exceptionRequestResolvedAt ?? null
      return {
        key: `day-${day.shiftExceptionId}`,
        shiftExceptionId: day.shiftExceptionId,
        exceptionRequestId: day.exceptionRequestId,
        date: isoDate(day.shiftExceptionsDate),
        status: cancelled ? VACATION_DAY_STATUS.CANCELLED : VACATION_DAY_STATUS.AUTHORIZED,
        description: day.shiftExceptionsDescription ?? null,
        requestedAt: (origin?.exceptionRequestCreatedAt ?? day.shiftExceptionsCreatedAt)?.toISO() ?? null,
        resolvedAt: authorizedAt?.toISO() ?? null,
        resolvedByName: authorizedBy ? (names.get(authorizedBy) ?? null) : null,
        resolutionNote: origin?.exceptionRequestResolutionNote ?? null,
        cancelledAt: cancelled ? (day.shiftExceptionCancelledAt?.toISO() ?? null) : null,
        cancelledByName:
          cancelled && day.shiftExceptionCancelledByUserId
            ? (names.get(day.shiftExceptionCancelledByUserId) ?? null)
            : null,
        cancelReason: cancelled ? day.shiftExceptionCancelReason : null,
        evidenceCount: evidenceCounts.get(day.shiftExceptionId) ?? 0,
        signatureUrl: signatures.get(day.shiftExceptionId) ?? null,
      }
    })

    const fromRequests = requests.map((row): VacationDayDto => {
      const refused = row.exceptionRequestStatus === 'refused'
      return {
        key: `request-${row.exceptionRequestId}`,
        shiftExceptionId: null,
        exceptionRequestId: row.exceptionRequestId,
        date: isoDate(row.requestedDate),
        status: refused ? VACATION_DAY_STATUS.REFUSED : VACATION_DAY_STATUS.PENDING,
        description: row.exceptionRequestDescription ?? null,
        requestedAt: row.exceptionRequestCreatedAt?.toISO() ?? null,
        resolvedAt: refused ? (row.exceptionRequestResolvedAt?.toISO() ?? null) : null,
        resolvedByName:
          refused && row.resolvedByUserId ? (names.get(row.resolvedByUserId) ?? null) : null,
        resolutionNote: refused ? row.exceptionRequestResolutionNote : null,
        cancelledAt: null,
        cancelledByName: null,
        cancelReason: null,
        evidenceCount: 0,
        signatureUrl: null,
      }
    })

    return [...fromDays, ...fromRequests].sort(byDateDesc)
  }

  private async evidenceCounts(dayIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>()
    if (dayIds.length === 0) return counts
    const rows = await ShiftExceptionEvidence.query()
      .whereIn('shift_exception_id', dayIds)
      .whereNull('shift_exception_evidence_deleted_at')
    for (const row of rows) {
      counts.set(row.shiftExceptionId, (counts.get(row.shiftExceptionId) ?? 0) + 1)
    }
    return counts
  }

  /**
   * La primera firma vigente de cada dia, igual que `get-vacations-by-period`,
   * como URL que el navegador puede abrir.
   *
   * La firma se guarda privada y en la fila queda su llave del storage; sin
   * firmarla, el `<img>` del backoffice no la puede pintar. Las filas viejas
   * con URL publica completa se entregan tal cual.
   */
  private async signatures(dayIds: number[]): Promise<Map<number, string>> {
    const byDay = new Map<number, string>()
    if (dayIds.length === 0) return byDay
    const rows = await VacationAuthorizationSignature.query()
      .whereNull('vacation_authorization_signature_deleted_at')
      .whereIn('shift_exception_id', dayIds)
      .orderBy('vacation_authorization_signature_created_at', 'asc')
    for (const row of rows) {
      if (!byDay.has(row.shiftExceptionId)) {
        byDay.set(row.shiftExceptionId, row.vacationAuthorizationSignatureFile)
      }
    }

    const keys = [...byDay.values()].filter((file) => file && !/^https?:\/\//i.test(file))
    if (keys.length === 0) return byDay
    const signedUrls = await new UploadService().getDownloadLinks(keys, SIGNATURE_URL_TTL_SECONDS)
    for (const [dayId, file] of byDay) {
      // Sin URL firmada (storage caido) se deja la llave: la imagen no carga,
      // pero el dia sigue firmado y no se ofrece firmarlo otra vez.
      const url = signedUrls[file]
      if (url) byDay.set(dayId, url)
    }
    return byDay
  }

  private async userNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))]
    const names = new Map<number, string>()
    if (unique.length === 0) return names
    const users = await User.query().whereIn('user_id', unique).preload('person')
    for (const user of users) {
      const person = user.person
      const name = person
        ? [person.personFirstname, person.personLastname, person.personSecondLastname]
            .filter((part) => typeof part === 'string' && part.trim().length > 0)
            .join(' ')
        : ''
      if (name) names.set(user.userId, name)
    }
    return names
  }
}

/** La fecha del dia sin hora, venga como venga del driver. */
function isoDate(value: unknown): string {
  if (value instanceof DateTime) return value.toISODate() ?? ''
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate() ?? ''
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

/** Lo mas reciente primero, como en la ficha. */
function byDateDesc(a: VacationDayDto, b: VacationDayDto): number {
  return b.date.localeCompare(a.date) || b.key.localeCompare(a.key)
}
