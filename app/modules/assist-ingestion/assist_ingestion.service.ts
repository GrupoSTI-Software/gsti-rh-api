import { DateTime } from 'luxon'
import Employee from '#models/employee'
import SyncAssistsService from '#services/sync_assists_service'
import { AssistError } from '#exceptions/assist_error'
import { resolveAssistBusinessUnitId } from '#helpers/assist_business_unit_guard'
import {
  assistIngestionNaturalKey,
  getAssistPunchTimeFutureToleranceSeconds,
  getAssistPunchTimeMaxBackdateHours,
  isAssistArrivalDeferred,
} from './assist_ingestion.constants.js'
import AssistIngestionRepositoryMysql from './assist_ingestion.repository.mysql.js'
import {
  ASSIST_INGESTION_BATCH_DUPLICATE_ITEM,
  ASSIST_INGESTION_EMPLOYEE_NOT_FOUND,
  ASSIST_INGESTION_EMPLOYEE_TERMINATED,
  ASSIST_INGESTION_PUNCH_TIME_FORMAT,
  ASSIST_INGESTION_PUNCH_TIME_FUTURE,
  ASSIST_INGESTION_PUNCH_TIME_OUT_OF_WINDOW,
  ASSIST_INGESTION_TENANT_UNRESOLVED,
} from './assist_ingestion.rejections.js'
import type { AssistIngestionRepository } from './assist_ingestion.repository.js'
import type {
  AssistIngestionItem,
  AssistIngestionItemResult,
  AssistIngestionPersisted,
  AssistIngestionRecord,
  AssistIngestionRejection,
  AssistIngestionResult,
  AssistIngestionSubject,
  AssistIngestionSummary,
} from './dto/assist_ingestion.dto.js'

/** Colaborador resuelto: a quién pertenece la checada y de qué empresa es. */
interface ResolvedSubject {
  employeeId: number
  employeeCode: string
  businessUnitId: number
}

type SubjectResolution =
  | { ok: true; subject: ResolvedSubject }
  | { ok: false; rejection: AssistIngestionRejection }

/**
 * Motor de ingesta de checadas.
 *
 * Resuelve el sujeto de cada elemento, descarta los gemelos que vienen repetidos
 * dentro de la misma entrega, delega la escritura idempotente en el puerto y arma
 * el veredicto por elemento conservando el orden original.
 *
 * El recálculo del calendario se dispara **sólo** por los elementos `inserted` y
 * **una sola vez por colaborador**, cubriendo el rango de todas sus checadas de la
 * entrega: un reenvío no cuesta trabajo, o una entrega de doscientas repeticiones
 * se convertiría en doscientos recálculos pedidos por el cliente.
 */
export default class AssistIngestionService {
  private readonly repository: AssistIngestionRepository

  constructor(repository: AssistIngestionRepository = new AssistIngestionRepositoryMysql()) {
    this.repository = repository
  }

  async ingest(items: AssistIngestionItem[]): Promise<AssistIngestionResult> {
    const results: AssistIngestionItemResult[] = items.map((item, index) => ({
      index,
      clientRef: item.clientRef,
      outcome: 'rejected',
      assist: null,
      error: ASSIST_INGESTION_EMPLOYEE_NOT_FOUND,
    }))

    const records: AssistIngestionRecord[] = []
    const seenNaturalKeys = new Set<string>()

    for (const [index, item] of items.entries()) {
      const resolution = await this.resolveSubject(item.subject)
      if (!resolution.ok) {
        results[index].error = resolution.rejection
        continue
      }

      const record: AssistIngestionRecord = {
        index,
        businessUnitId: resolution.subject.businessUnitId,
        employeeId: resolution.subject.employeeId,
        employeeCode: resolution.subject.employeeCode,
        assistType: item.assistType,
        punchTimeUtc: item.punchTimeUtc,
        geo: item.geo,
        origin: item.origin,
        createdByUserId: item.createdByUserId,
        terminalSn: item.terminalSn,
      }

      // Los gemelos se resuelven en memoria, antes de tocar la base: si se dejaran
      // a la base, el segundo saldría como "ya estaba" —indistinguible de un
      // reenvío legítimo— y un cliente podría provocar excepciones a voluntad.
      const naturalKey = assistIngestionNaturalKey(record)
      if (seenNaturalKeys.has(naturalKey)) {
        results[index].error = ASSIST_INGESTION_BATCH_DUPLICATE_ITEM
        continue
      }
      seenNaturalKeys.add(naturalKey)

      records.push(record)
    }

    const persisted = await this.repository.ingestMany(records)

    for (const row of persisted) {
      results[row.index] = {
        index: row.index,
        clientRef: items[row.index].clientRef,
        outcome: row.outcome,
        assist: row.assist,
        error: null,
      }
    }

    await this.recalculateCalendars(persisted)

    return { results, summary: summarize(results) }
  }

  /**
   * Resuelve el colaborador y su empresa.
   *
   * Un colaborador de otra empresa devuelve exactamente el mismo rechazo que uno
   * inexistente: nadie averigua desde fuera quién trabaja en otra empresa.
   */
  private async resolveSubject(subject: AssistIngestionSubject): Promise<SubjectResolution> {
    const employee =
      subject.kind === 'employeeId'
        ? await Employee.query().withTrashed().where('employee_id', subject.employeeId).first()
        : await Employee.query()
            .withTrashed()
            .where('business_unit_id', subject.businessUnitId)
            .where('employee_code', subject.employeeCode)
            .first()

    if (!employee) return { ok: false, rejection: ASSIST_INGESTION_EMPLOYEE_NOT_FOUND }
    if (employee.deletedAt) return { ok: false, rejection: ASSIST_INGESTION_EMPLOYEE_TERMINATED }

    try {
      return {
        ok: true,
        subject: {
          employeeId: employee.employeeId,
          employeeCode: employee.employeeCode ? String(employee.employeeCode) : '',
          businessUnitId: resolveAssistBusinessUnitId(employee.businessUnitId),
        },
      }
    } catch (error) {
      if (error instanceof AssistError) {
        return { ok: false, rejection: ASSIST_INGESTION_TENANT_UNRESOLVED }
      }
      throw error
    }
  }

  /**
   * Recalcula el calendario de asistencia de cada colaborador con al menos una
   * checada nueva, una sola vez y cubriendo el rango de todas sus checadas.
   */
  private async recalculateCalendars(persisted: AssistIngestionPersisted[]): Promise<void> {
    const ranges = assistIngestionCalendarRanges(persisted)
    if (ranges.size === 0) return

    const syncAssistsService = new SyncAssistsService()
    for (const [employeeID, range] of ranges) {
      await syncAssistsService.setDateCalendar({
        date: range.from.setZone('UTC-6').plus({ day: -1 }).toFormat('yyyy-MM-dd'),
        dateEnd: range.to.setZone('UTC-6').plus({ day: 1 }).toFormat('yyyy-MM-dd'),
        employeeID,
      })
    }
  }
}

/**
 * Rango de recálculo por colaborador: un solo tramo por cada persona con al menos
 * una checada nueva, cubriendo desde su marcaje más antiguo hasta el más reciente.
 *
 * Los desenlaces que no escribieron no generan rango: una entrega de doscientas
 * repeticiones no puede convertirse en doscientos recálculos.
 */
export function assistIngestionCalendarRanges(
  persisted: AssistIngestionPersisted[]
): Map<number, { from: DateTime; to: DateTime }> {
  const ranges = new Map<number, { from: DateTime; to: DateTime }>()

  for (const row of persisted) {
    if (row.outcome !== 'inserted') continue
    const punchTime = row.assist.assistPunchTimeUtc
    const current = ranges.get(row.assist.assistEmpId)
    if (!current) {
      ranges.set(row.assist.assistEmpId, { from: punchTime, to: punchTime })
      continue
    }
    if (punchTime.toMillis() < current.from.toMillis()) current.from = punchTime
    if (punchTime.toMillis() > current.to.toMillis()) current.to = punchTime
  }

  return ranges
}

function summarize(results: AssistIngestionItemResult[]): AssistIngestionSummary {
  const inserted = results.filter((result) => result.outcome === 'inserted').length
  const preexisting = results.filter((result) => result.outcome === 'preexisting').length
  const rejected = results.filter((result) => result.outcome === 'rejected').length

  return {
    received: results.length,
    inserted,
    preexisting,
    rejected,
    acknowledged: inserted + preexisting,
  }
}

const LEGACY_PUNCH_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss'
const LEGACY_PUNCH_TIME_ZONE = 'UTC-6'
/** ISO-8601 con desfase explícito: `Z`, `+HH:MM`, `-HH:MM` o sin dos puntos. */
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/

/** Hora de captura resuelta, o el motivo por el que no se acepta. */
export type ResolvedPunchTime =
  | { ok: true; punchTimeUtc: DateTime; deferredBySeconds: number; deferred: boolean }
  | { ok: false; rejection: AssistIngestionRejection }

/**
 * Resuelve la hora en que ocurrió la checada.
 *
 * **El orden no es negociable:** parsear → normalizar a UTC → validar futuro →
 * validar ventana → derivar la marca de diferida. Cualquier ajuste aplicado antes de
 * validar desplaza la frontera de "futuro" y falsea la marca.
 *
 * Sin hora declarada se usa el reloj del servidor y no se evalúa la ventana: un
 * equipo que no se ha actualizado sigue registrando exactamente como hoy.
 *
 * @param declared hora que el equipo de origen declara, si la declara
 * @param receivedAt instante en que el servidor recibió la checada
 */
export function resolvePunchTime(
  declared: string | null | undefined,
  receivedAt: DateTime
): ResolvedPunchTime {
  const received = receivedAt.toUTC()

  if (declared === null || declared === undefined || declared.trim() === '') {
    return { ok: true, punchTimeUtc: received, deferredBySeconds: 0, deferred: false }
  }

  const value = declared.trim()
  const parsed = EXPLICIT_OFFSET.test(value)
    ? DateTime.fromISO(value, { setZone: true }).toUTC()
    : DateTime.fromFormat(value, LEGACY_PUNCH_TIME_FORMAT, { zone: LEGACY_PUNCH_TIME_ZONE }).toUTC()

  if (!parsed.isValid) {
    return { ok: false, rejection: ASSIST_INGESTION_PUNCH_TIME_FORMAT }
  }

  const aheadSeconds = parsed.diff(received, 'seconds').seconds
  if (aheadSeconds > getAssistPunchTimeFutureToleranceSeconds()) {
    return { ok: false, rejection: ASSIST_INGESTION_PUNCH_TIME_FUTURE }
  }

  const behindSeconds = received.diff(parsed, 'seconds').seconds
  if (behindSeconds > getAssistPunchTimeMaxBackdateHours() * 3600) {
    return { ok: false, rejection: ASSIST_INGESTION_PUNCH_TIME_OUT_OF_WINDOW }
  }

  return {
    ok: true,
    punchTimeUtc: parsed,
    deferredBySeconds: Math.max(0, Math.trunc(behindSeconds)),
    deferred: isAssistArrivalDeferred(parsed, received),
  }
}
