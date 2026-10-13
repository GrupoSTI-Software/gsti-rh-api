import type { AssetsRepository } from './assets.repository.js'
import AssetsRepositoryMysql from './assets.repository.mysql.js'
import type {
  EmployeeTeleworkSuppliesDto,
  TeleworkCoverageRow,
  TeleworkSuppliesSummary,
} from './dto/telework_supplies.dto.js'
import {
  buildEmployeeTeleworkSupplies,
  summarizeTeleworkSupplies,
} from './telework_supplies.rules.js'

/**
 * Servicio de dominio del cumplimiento de insumos de teletrabajo
 * (VLRH-H1791485252682). Sin `TenantContext` ni modelos: el alcance de
 * empresas viaja siempre como argumento posicional y el repositorio lo mete
 * DENTRO de cada consulta. Es la única puerta de las cinco pantallas que leen
 * el cumplimiento, para que ninguna calcule por su cuenta.
 *
 * N+1: `summarizeForEmployees` emite exactamente un par de lecturas para todo
 * el lote y agrupa en memoria antes de construir cada matriz.
 */
export class TeleworkSuppliesService {
  constructor(private readonly repository: AssetsRepository) {}

  /**
   * Matriz de cumplimiento de un colaborador acotada al alcance. Perfil fuera
   * de alcance (o inexistente) → `null` (el 404 es solo por alcance, R12).
   */
  async matrixForEmployee(
    businessUnitIds: readonly number[],
    employeeId: number
  ): Promise<EmployeeTeleworkSuppliesDto | null> {
    const profiles = await this.repository.findTeleworkProfiles(businessUnitIds, [employeeId])
    const profile = profiles.find((candidate) => candidate.employeeId === employeeId) ?? null
    if (profile === null) return null

    const rows = await this.repository.findTeleworkCoverage(businessUnitIds, [employeeId])
    return buildEmployeeTeleworkSupplies(profile, rows)
  }

  /**
   * Resumen por colaborador de un lote en UNA sola pasada de lecturas. Solo
   * entran los perfiles en alcance: un id fuera de alcance queda ausente del
   * `Map` (ausencia ≠ ceros); un colaborador en alcance aparece siempre, con
   * `applies: false` y conteos en cero cuando no aplica. Ids repetidos no
   * duplican entradas. Cualquier argumento vacío → `Map` vacío sin consultar.
   */
  async summarizeForEmployees(
    businessUnitIds: readonly number[],
    employeeIds: readonly number[]
  ): Promise<Map<number, TeleworkSuppliesSummary>> {
    const summaryByEmployee = new Map<number, TeleworkSuppliesSummary>()
    if (businessUnitIds.length === 0 || employeeIds.length === 0) return summaryByEmployee

    const [profiles, coverage] = await Promise.all([
      this.repository.findTeleworkProfiles(businessUnitIds, employeeIds),
      this.repository.findTeleworkCoverage(businessUnitIds, employeeIds),
    ])

    const rowsByEmployee = new Map<number, TeleworkCoverageRow[]>()
    for (const row of coverage) {
      const bucket = rowsByEmployee.get(row.employeeId) ?? []
      bucket.push(row)
      rowsByEmployee.set(row.employeeId, bucket)
    }

    for (const profile of profiles) {
      const matrix = buildEmployeeTeleworkSupplies(
        profile,
        rowsByEmployee.get(profile.employeeId) ?? []
      )
      summaryByEmployee.set(profile.employeeId, summarizeTeleworkSupplies(matrix))
    }

    return summaryByEmployee
  }
}

/**
 * Única forma de construcción para los consumidores (los cinco HUs que leen el
 * cumplimiento). Hoy ata el servicio al adaptador MySQL; el controller nunca
 * instancia la clase directamente.
 */
export function makeTeleworkSuppliesService(): TeleworkSuppliesService {
  return new TeleworkSuppliesService(new AssetsRepositoryMysql())
}
