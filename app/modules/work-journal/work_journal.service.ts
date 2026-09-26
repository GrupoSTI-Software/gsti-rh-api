import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import WorkJournalEntry from '#models/work_journal_entry'
import type { WorkJournalSnapshot } from '#models/work_journal_entry'
import { WorkJournalEntryError } from '#exceptions/work_journal_entry_error'
import { WJE_ERROR_CODES } from '#constants/work_journal_entry_error_codes'
import WorkJournalMaterializer from './work_journal.materializer.js'
import WorkJournalRepositoryMysql from './work_journal.repository.mysql.js'
import { CURRENT_HMAC_KEY_VERSION, computeSeal, sealsMatch } from './work_journal.hash.js'
import type { WorkJournalRepository } from './work_journal.repository.js'
import type {
  InvalidEntry,
  MaterializedDay,
  SealFailure,
  SealPeriodInput,
  SealResult,
  VerifyPeriodInput,
  VerifyResult,
} from './dto/work_journal.dto.js'

/**
 * Lógica de negocio del registro electrónico de jornada:
 *  - `seal`: congela y sella (HMAC-SHA-256) la jornada de un periodo dado.
 *  - `verify`: recalcula el sello y detecta alteraciones.
 *  - `list`: consulta las entradas de un periodo (sin recalcular jornada).
 *
 * El aislamiento por empresa lo garantiza el scope multi-tenant del modelo más
 * el filtro explícito por `businessUnitId` en el repositorio.
 */
export default class WorkJournalService {
  private readonly repository: WorkJournalRepository
  private readonly materializer: WorkJournalMaterializer

  constructor(
    i18n?: I18n,
    repository: WorkJournalRepository = new WorkJournalRepositoryMysql(),
    materializer: WorkJournalMaterializer = new WorkJournalMaterializer(i18n)
  ) {
    this.repository = repository
    this.materializer = materializer
  }

  /**
   * Sella el periodo [from, to] de los empleados indicados (o todos los de la
   * empresa). Los días ya cerrados se respetan (inmutables); el resto se
   * materializa desde el cálculo vigente, se sella y se marca cerrado.
   */
  async seal(businessUnitId: number, input: SealPeriodInput): Promise<SealResult> {
    this.assertRange(input.from, input.to)

    const employees = await this.repository.listEmployees(businessUnitId, input.employeeIds)

    let sealed = 0
    let skipped = 0
    const failed: SealFailure[] = []

    for (const employee of employees) {
      const days = await this.materializer.buildForEmployee(
        employee.employeeId,
        input.from,
        input.to
      )

      if (days.length === 0) {
        // No hay jornada materializable: no se crean entradas vacías (AC).
        failed.push({
          employeeId: employee.employeeId,
          date: null,
          reason: 'periodo-sin-datos',
        })
        continue
      }

      const existing = await this.repository.listEntriesInRange(
        businessUnitId,
        employee.employeeId,
        input.from,
        input.to
      )
      const existingByDate = new Map<string, WorkJournalEntry>()
      for (const entry of existing) {
        const key = entry.date.toISODate()
        if (key) {
          existingByDate.set(key, entry)
        }
      }

      for (const day of days) {
        const current = existingByDate.get(day.date)
        if (current && current.status === 'closed') {
          // Día ya cerrado: se respeta la inmutabilidad, se omite del lote.
          skipped += 1
          continue
        }

        try {
          await this.sealDay(businessUnitId, employee.employeeId, input, day, current)
          sealed += 1
        } catch (error) {
          failed.push({
            employeeId: employee.employeeId,
            date: day.date,
            reason: error instanceof Error ? error.message : 'error-no-clasificado',
          })
        }
      }
    }

    return { sealed, skipped, failed }
  }

  /** Sella un día concreto: arma el snapshot, calcula el sello y persiste cerrado. */
  private async sealDay(
    businessUnitId: number,
    employeeId: number,
    input: SealPeriodInput,
    day: MaterializedDay,
    current: WorkJournalEntry | undefined
  ): Promise<void> {
    const workingTimeRuleId = await this.repository.resolveEffectiveRuleId(businessUnitId, day.date)

    const snapshot: WorkJournalSnapshot = {
      employeeId,
      businessUnitId,
      date: day.date,
      periodStart: input.from,
      periodEnd: input.to,
      checkIn: day.checkIn,
      checkOut: day.checkOut,
      workedMinutes: day.workedMinutes,
      dayStatus: day.dayStatus,
      shiftId: day.shiftId,
      workingTimeRuleId,
    }

    const contentHash = computeSeal(snapshot, CURRENT_HMAC_KEY_VERSION)
    const closedAt = DateTime.now()

    const attributes = {
      employeeId,
      businessUnitId,
      workingTimeRuleId,
      shiftId: day.shiftId,
      date: DateTime.fromISO(day.date),
      periodStart: DateTime.fromISO(input.from),
      periodEnd: DateTime.fromISO(input.to),
      checkIn: day.checkIn ? DateTime.fromISO(day.checkIn) : null,
      checkOut: day.checkOut ? DateTime.fromISO(day.checkOut) : null,
      workedMinutes: day.workedMinutes,
      dayStatus: day.dayStatus,
      status: 'closed' as const,
      closedAt,
      snapshot,
      contentHash,
      hmacKeyVersion: CURRENT_HMAC_KEY_VERSION,
    }

    if (current) {
      current.merge(attributes)
      await current.save()
      return
    }

    await WorkJournalEntry.create(attributes)
  }

  /**
   * Verifica la integridad de las entradas cerradas del periodo: recalcula el
   * HMAC sobre el snapshot (con la hmac_key_version guardada) y lo compara en
   * tiempo constante. Las entradas abiertas/sin sellar no se verifican.
   */
  async verify(businessUnitId: number, input: VerifyPeriodInput): Promise<VerifyResult> {
    this.assertRange(input.from, input.to)

    const employeeIds = input.employeeId ? [input.employeeId] : undefined
    const entries = await this.repository.listBusinessUnitEntriesInRange(
      businessUnitId,
      input.from,
      input.to,
      employeeIds
    )

    let checked = 0
    let valid = 0
    const invalid: InvalidEntry[] = []

    for (const entry of entries) {
      if (entry.status !== 'closed' || !entry.snapshot || !entry.contentHash) {
        continue
      }
      checked += 1

      const recomputed = computeSeal(
        entry.snapshot,
        entry.hmacKeyVersion ?? CURRENT_HMAC_KEY_VERSION
      )
      if (sealsMatch(entry.contentHash, recomputed)) {
        valid += 1
      } else {
        invalid.push({
          workJournalEntryId: entry.workJournalEntryId,
          employeeId: entry.employeeId,
          date: entry.date.toISODate() ?? '',
          key: 'integridad-invalida',
          code: WJE_ERROR_CODES.INTEGRITY_INVALID,
        })
      }
    }

    return { checked, valid, invalid }
  }

  /** Lista paginada las entradas de un periodo (para consulta; no recalcula jornada). */
  async list(
    businessUnitId: number,
    from: string,
    to: string,
    options: { employeeId?: number; status?: 'open' | 'closed'; page: number; limit: number }
  ) {
    this.assertRange(from, to)
    return this.repository.paginateBusinessUnitEntries(businessUnitId, from, to, options)
  }

  /** Valida que el rango sea coherente (fechas ISO y from ≤ to). */
  private assertRange(from: string, to: string): void {
    const fromDt = DateTime.fromISO(from)
    const toDt = DateTime.fromISO(to)
    if (!fromDt.isValid || !toDt.isValid || fromDt > toDt) {
      throw new WorkJournalEntryError(
        'El rango del periodo es inválido.',
        WJE_ERROR_CODES.VAL_INPUT,
        422,
        'rango-invalido',
        'Verifique que "from" y "to" sean fechas válidas y que from ≤ to.'
      )
    }
  }
}
