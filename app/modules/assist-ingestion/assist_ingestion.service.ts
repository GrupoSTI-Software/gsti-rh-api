import { DateTime } from 'luxon'
import Employee from '#models/employee'
import SyncAssistsService from '#services/sync_assists_service'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { resolveAssistBusinessUnitId } from '#helpers/assist_business_unit_guard'
import AssistIngestionRepositoryMysql from './assist_ingestion.repository.mysql.js'
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

/** El `employeeId` no resuelve a un colaborador de la empresa activa (regla 8). */
const EMPLOYEE_NOT_FOUND: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_EMPLOYEE_NOT_FOUND,
  key: 'colaborador-no-encontrado',
  i18nBase: 'assist_employee_not_found',
}

/** Colaborador resuelto: a quién pertenece la checada y de qué empresa es. */
interface ResolvedSubject {
  employeeId: number
  employeeCode: string
  businessUnitId: number
}

/**
 * Motor de ingesta de checadas.
 *
 * Resuelve el sujeto, delega la escritura idempotente en el puerto y arma el
 * veredicto por elemento. El recálculo del calendario se dispara **sólo** por los
 * elementos `inserted` y **una sola vez por colaborador**: un reenvío no cuesta
 * trabajo, o cualquiera podría multiplicar la carga del servidor repitiendo envíos.
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
      error: EMPLOYEE_NOT_FOUND,
    }))

    const records: AssistIngestionRecord[] = []

    for (const [index, item] of items.entries()) {
      const subject = await this.resolveSubject(item.subject)
      if (!subject) continue

      records.push({
        index,
        businessUnitId: subject.businessUnitId,
        employeeId: subject.employeeId,
        employeeCode: subject.employeeCode,
        assistType: item.assistType,
        punchTimeUtc: item.punchTimeUtc,
        geo: item.geo,
        origin: item.origin,
        createdByUserId: item.createdByUserId,
        terminalSn: item.terminalSn,
      })
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
   * Resuelve el colaborador y su empresa. Devuelve `null` cuando no llega a uno solo
   * de la empresa activa: la respuesta es indistinguible de "no existe" aunque el
   * colaborador sea de otra empresa (anti-enumeración, regla 8).
   */
  private async resolveSubject(subject: AssistIngestionSubject): Promise<ResolvedSubject | null> {
    const employee =
      subject.kind === 'employeeId'
        ? await Employee.query()
            .whereNull('employee_deleted_at')
            .where('employee_id', subject.employeeId)
            .first()
        : await Employee.query()
            .whereNull('employee_deleted_at')
            .where('business_unit_id', subject.businessUnitId)
            .where('employee_code', subject.employeeCode)
            .first()

    if (!employee) return null

    return {
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode ? String(employee.employeeCode) : '',
      businessUnitId: resolveAssistBusinessUnitId(employee.businessUnitId),
    }
  }

  /**
   * Recalcula el calendario de asistencia de cada colaborador con al menos una
   * checada nueva, una sola vez y cubriendo el rango de todas sus checadas del envío.
   */
  private async recalculateCalendars(persisted: AssistIngestionPersisted[]): Promise<void> {
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
