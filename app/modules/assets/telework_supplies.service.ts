import type { AssetsRepository } from './assets.repository.js'
import AssetsRepositoryMysql from './assets.repository.mysql.js'
import type { OwnEquipmentDeclarationsRepository } from './own_equipment_declarations.repository.js'
import OwnEquipmentDeclarationsRepositoryMysql from './own_equipment_declarations.repository.mysql.js'
import type {
  EmployeeTeleworkSuppliesDto,
  TeleworkCoverageRow,
  TeleworkSuppliesSummary,
} from './dto/telework_supplies.dto.js'
import type {
  OwnEquipmentDeclarationByEmployee,
  OwnEquipmentDeclarationDto,
} from './dto/own_equipment_declarations.dto.js'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import {
  buildEmployeeTeleworkSupplies,
  summarizeTeleworkSupplies,
} from './telework_supplies.rules.js'

/** Declaraciones vigentes por categoría de un colaborador (punto de extensión de la regla). */
type OwnEquipmentByCategory = Map<SupplyTypeTeleworkCategory, OwnEquipmentDeclarationDto>

/**
 * Agrupa las declaraciones vigentes por colaborador y, dentro, por categoría,
 * en UNA sola pasada: es el mapa que consume `buildEmployeeTeleworkSupplies`.
 * El orden de las filas no importa (a lo sumo hay una vigente por categoría).
 */
function groupOpenDeclarations(
  declarations: readonly OwnEquipmentDeclarationByEmployee[]
): Map<number, OwnEquipmentByCategory> {
  const byEmployee = new Map<number, OwnEquipmentByCategory>()
  for (const entry of declarations) {
    const byCategory = byEmployee.get(entry.employeeId) ?? new Map()
    byCategory.set(entry.declaration.category, entry.declaration)
    byEmployee.set(entry.employeeId, byCategory)
  }
  return byEmployee
}

/**
 * Servicio de dominio del cumplimiento de insumos de teletrabajo
 * (VLRH-H1791485252682; el equipo propio declarado llega con
 * VLRH-H1791306075599). Sin `TenantContext` ni modelos: el alcance de
 * empresas viaja siempre como argumento posicional y el repositorio lo mete
 * DENTRO de cada consulta. Es la única puerta de las cinco pantallas que leen
 * el cumplimiento, para que ninguna calcule por su cuenta.
 *
 * N+1: `summarizeForEmployees` emite exactamente un trío de lecturas para todo
 * el lote (perfiles, cobertura y declaraciones vigentes) y agrupa en memoria
 * antes de construir cada matriz.
 */
export class TeleworkSuppliesService {
  constructor(
    private readonly repository: AssetsRepository,
    private readonly declarations: OwnEquipmentDeclarationsRepository = new OwnEquipmentDeclarationsRepositoryMysql()
  ) {}

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

    const [rows, declarations] = await Promise.all([
      this.repository.findTeleworkCoverage(businessUnitIds, [employeeId]),
      this.declarations.findOpenByEmployees(businessUnitIds, [employeeId]),
    ])

    return buildEmployeeTeleworkSupplies(
      profile,
      rows,
      groupOpenDeclarations(declarations).get(employeeId) ?? new Map()
    )
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

    const [profiles, coverage, declarations] = await Promise.all([
      this.repository.findTeleworkProfiles(businessUnitIds, employeeIds),
      this.repository.findTeleworkCoverage(businessUnitIds, employeeIds),
      this.declarations.findOpenByEmployees(businessUnitIds, employeeIds),
    ])

    const rowsByEmployee = new Map<number, TeleworkCoverageRow[]>()
    for (const row of coverage) {
      const bucket = rowsByEmployee.get(row.employeeId) ?? []
      bucket.push(row)
      rowsByEmployee.set(row.employeeId, bucket)
    }

    const declarationsByEmployee = groupOpenDeclarations(declarations)

    for (const profile of profiles) {
      const matrix = buildEmployeeTeleworkSupplies(
        profile,
        rowsByEmployee.get(profile.employeeId) ?? [],
        declarationsByEmployee.get(profile.employeeId) ?? new Map()
      )
      summaryByEmployee.set(profile.employeeId, summarizeTeleworkSupplies(matrix))
    }

    return summaryByEmployee
  }
}

/**
 * Única forma de construcción para los consumidores (los cinco HUs que leen el
 * cumplimiento). Cablea los dos adaptadores MySQL; la firma pública no cambia y
 * el controller nunca instancia la clase directamente.
 */
export function makeTeleworkSuppliesService(): TeleworkSuppliesService {
  return new TeleworkSuppliesService(
    new AssetsRepositoryMysql(),
    new OwnEquipmentDeclarationsRepositoryMysql()
  )
}
