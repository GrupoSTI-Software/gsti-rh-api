import type { ModelPaginatorContract } from '@adonisjs/lucid/types/model'
import type Employee from '#models/employee'
import type WorkJournalEntry from '#models/work_journal_entry'

/**
 * Puerto de persistencia del módulo de registro electrónico de jornada.
 * Aísla la lógica de negocio del acceso Lucid/MySQL y facilita el testeo.
 */
export interface WorkJournalRepository {
  /** Empleados de una empresa (opcionalmente acotados a una lista de ids). */
  listEmployees(businessUnitId: number, employeeIds?: number[]): Promise<Employee[]>

  /** Entradas de jornada de un empleado dentro de un rango [from, to] inclusivo. */
  listEntriesInRange(
    businessUnitId: number,
    employeeId: number,
    from: string,
    to: string
  ): Promise<WorkJournalEntry[]>

  /** Entradas de la empresa en el rango (para verificación agregada). */
  listBusinessUnitEntriesInRange(
    businessUnitId: number,
    from: string,
    to: string,
    employeeIds?: number[]
  ): Promise<WorkJournalEntry[]>

  /** Listado paginado de entradas del scope (para la consulta de lectura). */
  paginateBusinessUnitEntries(
    businessUnitId: number,
    from: string,
    to: string,
    options: { employeeId?: number; status?: 'open' | 'closed'; page: number; limit: number }
  ): Promise<ModelPaginatorContract<WorkJournalEntry>>

  /**
   * Resuelve el id de la regla de jornada vigente para (empresa, fecha):
   * override de la empresa si existe, si no el federal vigente, si no null.
   */
  resolveEffectiveRuleId(businessUnitId: number, date: string): Promise<number | null>
}
