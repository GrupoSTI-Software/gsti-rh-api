import WorkDisability from '#models/work_disability'
import type WorkDisabilityNote from '#models/work_disability_note'
import type WorkDisabilityPeriod from '#models/work_disability_period'
import type User from '#models/user'
import { toIsoDay, workDisabilityDays } from './work_disability_rules.js'

/** Periodo tal como lo pinta la línea de periodos de la ficha. */
export interface WorkDisabilityPeriodDto {
  workDisabilityPeriodId: number
  typeId: number
  typeName: string | null
  typeSlug: string | null
  folio: string | null
  /** yyyy-MM-dd */
  startDate: string
  /** yyyy-MM-dd */
  endDate: string
  days: number
  hasFile: boolean
  registeredByName: string | null
  registeredAt: string | null
}

export interface WorkDisabilityExpenseDto {
  workDisabilityPeriodExpenseId: number
  workDisabilityPeriodId: number
  concept: string | null
  amount: number
  /** Cuándo se registró el gasto (ISO). */
  registeredAt: string | null
  hasFile: boolean
}

export interface WorkDisabilityNoteDto {
  workDisabilityNoteId: number
  /** Ya enmascarada según los permisos de salud de quien consulta. */
  description: string | null
  authorUserId: number
  authorName: string | null
  createdAt: string | null
}

export interface WorkDisabilityDto {
  workDisabilityId: number
  coverageId: number
  coverageName: string | null
  coverageSlug: string | null
  /** Primer día del periodo inicial, yyyy-MM-dd. */
  startDate: string | null
  /** Último día amparado del último periodo, yyyy-MM-dd. */
  endDate: string | null
  totalDays: number
  periods: WorkDisabilityPeriodDto[]
  expenses: WorkDisabilityExpenseDto[]
  notes: WorkDisabilityNoteDto[]
}

/** Nombre visible de una cuenta, el de su persona; sin persona no se muestra nada. */
function nameOf(user: User | null | undefined): string | null {
  const person = user?.person
  if (!person) return null
  const name = [person.personFirstname, person.personLastname, person.personSecondLastname]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
  return name || null
}

/**
 * Incapacidades de un colaborador con todo lo que la ficha muestra: periodos,
 * gastos internos y seguimiento, en una sola consulta.
 *
 * Los periodos van del más antiguo al más reciente (el primero es el inicial);
 * las incapacidades, de la más reciente a la más antigua.
 */
export default class WorkDisabilityFeedService {
  async list(employeeId: number): Promise<WorkDisabilityDto[]> {
    const disabilities = await WorkDisability.query()
      .whereNull('work_disability_deleted_at')
      .where('employee_id', employeeId)
      .preload('insuranceCoverageType')
      .preload('workDisabilityPeriods', (periods) => {
        periods
          .whereNull('work_disability_period_deleted_at')
          .orderBy('work_disability_period_start_date', 'asc')
          .preload('registeredBy')
          .preload('workDisabilityPeriodExpenses', (expenses) => {
            expenses
              .whereNull('work_disability_period_expense_deleted_at')
              .orderBy('work_disability_period_expense_created_at', 'asc')
          })
      })
      .preload('workDisabilityNotes', (notes) => {
        notes
          .whereNull('work_disability_note_deleted_at')
          .orderBy('work_disability_note_created_at', 'desc')
          .preload('user')
      })

    return disabilities
      .map((disability) => this.toDto(disability))
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
  }

  private toDto(disability: WorkDisability): WorkDisabilityDto {
    const periods = disability.workDisabilityPeriods.map((period) => this.periodDto(period))
    const expenses = disability.workDisabilityPeriods.flatMap((period) =>
      period.workDisabilityPeriodExpenses.map((expense) => ({
        workDisabilityPeriodExpenseId: expense.workDisabilityPeriodExpenseId,
        workDisabilityPeriodId: expense.workDisabilityPeriodId,
        concept: expense.workDisabilityPeriodExpenseConcept ?? null,
        amount: Number(expense.workDisabilityPeriodExpenseAmount ?? 0),
        registeredAt: expense.workDisabilityPeriodExpenseCreatedAt?.toISO() ?? null,
        hasFile: Boolean(expense.workDisabilityPeriodExpenseFile),
      }))
    )

    return {
      workDisabilityId: disability.workDisabilityId,
      coverageId: disability.insuranceCoverageTypeId,
      coverageName: disability.insuranceCoverageType?.insuranceCoverageTypeName ?? null,
      coverageSlug: disability.insuranceCoverageType?.insuranceCoverageTypeSlug ?? null,
      startDate: periods[0]?.startDate ?? null,
      endDate: periods.length ? periods.reduce((last, p) => (p.endDate > last ? p.endDate : last), periods[0].endDate) : null,
      totalDays: periods.reduce((total, period) => total + period.days, 0),
      periods,
      expenses,
      notes: disability.workDisabilityNotes.map((note) => this.noteDto(note)),
    }
  }

  private periodDto(period: WorkDisabilityPeriod): WorkDisabilityPeriodDto {
    const startDate = toIsoDay(period.workDisabilityPeriodStartDate)
    const endDate = toIsoDay(period.workDisabilityPeriodEndDate)
    return {
      workDisabilityPeriodId: period.workDisabilityPeriodId,
      typeId: period.workDisabilityTypeId,
      typeName: period.workDisabilityType?.workDisabilityTypeName ?? null,
      typeSlug: period.workDisabilityType?.workDisabilityTypeSlug ?? null,
      folio: period.workDisabilityPeriodTicketFolio || null,
      startDate,
      endDate,
      days: workDisabilityDays(startDate, endDate),
      hasFile: Boolean(period.workDisabilityPeriodFile),
      registeredByName: nameOf(period.registeredBy),
      registeredAt: period.workDisabilityPeriodCreatedAt?.toISO() ?? null,
    }
  }

  private noteDto(note: WorkDisabilityNote): WorkDisabilityNoteDto {
    // `serialize()` aplica el enmascarado de salud según quien consulta.
    const serialized = note.serialize() as { workDisabilityNoteDescription?: string | null }
    return {
      workDisabilityNoteId: note.workDisabilityNoteId,
      description: serialized.workDisabilityNoteDescription ?? null,
      authorUserId: note.userId,
      authorName: nameOf(note.user),
      createdAt: note.workDisabilityNoteCreatedAt?.toISO() ?? null,
    }
  }
}
