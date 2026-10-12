import {
  EMPLOYEE_ASSET_CUSTODY_STATUSES,
  type EmployeeAssetCustodyStatus,
  type TeleworkSupplyCoverageStatus,
} from './assets.constants.js'
import {
  EMPLOYEE_WORK_SCHEDULE,
  TELEWORK_LEGAL_THRESHOLD_PERCENT,
} from '#constants/employee_work_schedule'
import {
  SUPPLY_TYPE_TELEWORK_CATEGORIES,
  SUPPLY_TYPE_TELEWORK_CATEGORY,
  type SupplyTypeTeleworkCategory,
} from '#constants/supply_type_telework_category'
import type {
  EmployeeTeleworkSuppliesDto,
  TeleworkCoverageRow,
  TeleworkProfile,
  TeleworkSuppliesSummary,
  TeleworkSupplyAssetDto,
  TeleworkSupplyCategoryDto,
} from './dto/telework_supplies.dto.js'

/**
 * Reglas puras del cumplimiento de insumos de teletrabajo (NOM-037-STPS-2023
 * 5.7, VLRH-H1791485252682). Sin I/O: el repositorio, el servicio y el
 * endpoint solo consumen estos nombres. Todo lo que se calcula aquí es
 * determinista y no depende del orden de las filas.
 */

/** Guarda de exhaustividad privada del archivo (no existe helper compartido). */
function assertNever(value: never): never {
  throw new Error(`Estado de cobertura no manejado: ${String(value)}`)
}

/**
 * Resumen base sin aplicar, siempre una instancia nueva (evita mutación
 * compartida): `applies`/`isLegallyRequired` en falso y los cinco conteos en
 * cero.
 */
function emptySummary(): TeleworkSuppliesSummary {
  return {
    applies: false,
    isLegallyRequired: false,
    deliveredCount: 0,
    shippingCount: 0,
    ownEquipmentCount: 0,
    uncoveredCount: 0,
    unsignedCustodyCount: 0,
  }
}

/**
 * Aplica el colaborador al cumplimiento de insumos: modalidad Remote o
 * Híbrido, porcentaje de teletrabajo mayor a cero y no dado de baja (propias
 * 8-9: las mismas condiciones del listado 5.1). El umbral legal es además
 * inclusivo (R4): `teleworkPercentage >= TELEWORK_LEGAL_THRESHOLD_PERCENT`.
 */
export function resolveTeleworkApplicability(profile: TeleworkProfile): {
  applies: boolean
  isLegallyRequired: boolean
} {
  const applies =
    (profile.workSchedule === EMPLOYEE_WORK_SCHEDULE.REMOTE ||
      profile.workSchedule === EMPLOYEE_WORK_SCHEDULE.HYBRID) &&
    profile.teleworkPercentage > 0 &&
    !profile.isDeleted

  return {
    applies,
    isLegallyRequired: applies && profile.teleworkPercentage >= TELEWORK_LEGAL_THRESHOLD_PERCENT,
  }
}

/**
 * Estado de cobertura de una categoría (prioridad R5/R6): algún resguardo
 * `active` la entrega; si no, tener filas abiertas la deja `shipping`; sin
 * filas, el equipo propio declarado o la obligatoriedad de la categoría
 * deciden. No depende del orden de las filas.
 */
export function resolveCategoryStatus(
  category: SupplyTypeTeleworkCategory,
  rows: readonly TeleworkCoverageRow[],
  ownEquipmentCategories: ReadonlySet<SupplyTypeTeleworkCategory>
): TeleworkSupplyCoverageStatus {
  if (rows.some((row) => row.assignmentStatus === 'active')) {
    return 'delivered'
  }
  if (rows.length > 0) {
    return 'shipping'
  }
  if (ownEquipmentCategories.has(category)) {
    return 'own_equipment'
  }
  if (category === SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY) {
    return 'not_delivered'
  }
  return 'uncovered'
}

/**
 * Construye la matriz de cumplimiento del colaborador: filtra sus filas,
 * arma las tres categorías en el orden de la norma, mapea `hasContract` a
 * `custodyStatus` y embebe el resumen. Con `applies: false` retorna
 * `categories` vacío y resumen en ceros.
 */
export function buildEmployeeTeleworkSupplies(
  profile: TeleworkProfile,
  rows: readonly TeleworkCoverageRow[],
  ownEquipmentCategories: ReadonlySet<SupplyTypeTeleworkCategory> = new Set()
): EmployeeTeleworkSuppliesDto {
  const applicability = resolveTeleworkApplicability(profile)
  const ownRows = rows.filter((row) => row.employeeId === profile.employeeId)

  if (!applicability.applies) {
    const matrix: EmployeeTeleworkSuppliesDto = {
      employeeId: profile.employeeId,
      applies: false,
      isLegallyRequired: false,
      teleworkPercentage: profile.teleworkPercentage,
      legalThresholdPercent: TELEWORK_LEGAL_THRESHOLD_PERCENT,
      categories: [],
      teleworkSuppliesSummary: emptySummary(),
    }
    return { ...matrix, teleworkSuppliesSummary: summarizeTeleworkSupplies(matrix) }
  }

  const categories = SUPPLY_TYPE_TELEWORK_CATEGORIES.map((category) =>
    buildCategoryDto(
      category,
      ownRows.filter((row) => row.category === category),
      ownEquipmentCategories
    )
  ) as [TeleworkSupplyCategoryDto, TeleworkSupplyCategoryDto, TeleworkSupplyCategoryDto]

  const matrix: EmployeeTeleworkSuppliesDto = {
    employeeId: profile.employeeId,
    applies: true,
    isLegallyRequired: applicability.isLegallyRequired,
    teleworkPercentage: profile.teleworkPercentage,
    legalThresholdPercent: TELEWORK_LEGAL_THRESHOLD_PERCENT,
    categories,
    teleworkSuppliesSummary: emptySummary(),
  }
  return { ...matrix, teleworkSuppliesSummary: summarizeTeleworkSupplies(matrix) }
}

/**
 * Resume los conteos de la matriz: un renglón por categoría según su estado,
 * `uncoveredCount` solo silla y cómputo (el tipo lo garantiza) y
 * `unsignedCustodyCount` sobre los activos entregados (`active`) sin
 * contrato, contados por activo — el resguardo `shipping` sin contrato no
 * cuenta (R6). Sin `applies` todo queda en cero.
 */
export function summarizeTeleworkSupplies(
  matrix: EmployeeTeleworkSuppliesDto
): TeleworkSuppliesSummary {
  if (!matrix.applies) {
    return emptySummary()
  }

  const summary = emptySummary()
  summary.applies = matrix.applies
  summary.isLegallyRequired = matrix.isLegallyRequired
  const unsignedCustodyIds = new Set<number>()

  for (const category of matrix.categories) {
    const status = category.status
    switch (status) {
      case 'delivered':
        summary.deliveredCount += 1
        break
      case 'shipping':
        summary.shippingCount += 1
        break
      case 'own_equipment':
        summary.ownEquipmentCount += 1
        break
      case 'uncovered':
        summary.uncoveredCount += 1
        break
      case 'not_delivered':
        break
      default:
        assertNever(status)
    }

    for (const asset of category.assets) {
      if (asset.assignmentStatus === 'active' && asset.custodyStatus === 'unsigned') {
        unsignedCustodyIds.add(asset.employeeSupplyId)
      }
    }
  }

  summary.unsignedCustodyCount = unsignedCustodyIds.size
  return summary
}

/**
 * Arma el DTO de una categoría. Cuando está cubierta (`delivered`/`shipping`)
 * el arreglo de activos es no vacío por construcción (hay filas abiertas),
 * pero `Array.map` no puede producir la tupla no vacía que exige la unión
 * discriminada, así que se hace un cast controlado — nunca `any`. El resto
 * de estados viajan con `assets` vacío.
 */
function buildCategoryDto(
  category: SupplyTypeTeleworkCategory,
  rows: readonly TeleworkCoverageRow[],
  ownEquipmentCategories: ReadonlySet<SupplyTypeTeleworkCategory>
): TeleworkSupplyCategoryDto {
  const status = resolveCategoryStatus(category, rows, ownEquipmentCategories)

  if (status === 'delivered' || status === 'shipping') {
    const assets = rows.map(toAssetDto)
    return {
      category,
      status,
      assets: assets as [TeleworkSupplyAssetDto, ...TeleworkSupplyAssetDto[]],
    }
  }

  if (status === 'own_equipment') {
    return { category, status, assets: [] }
  }

  if (status === 'uncovered' && category !== SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY) {
    return { category, status, assets: [] }
  }

  return { category: SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY, status: 'not_delivered', assets: [] }
}

/** Mapea una fila de cobertura al activo del DTO, con el resguardo firmado o no. */
function toAssetDto(row: TeleworkCoverageRow): TeleworkSupplyAssetDto {
  return {
    employeeSupplyId: row.employeeSupplyId,
    supplyId: row.supplyId,
    name: row.name,
    fileNumber: row.fileNumber,
    assignmentStatus: row.assignmentStatus,
    custodyStatus: resolveCustodyStatus(row.hasContract),
    assignedAt: row.assignedAt,
  }
}

/** `signed` si hay contrato vivo; `unsigned` si no (orden de la constante del módulo). */
function resolveCustodyStatus(hasContract: boolean): EmployeeAssetCustodyStatus {
  const [signed, unsigned] = EMPLOYEE_ASSET_CUSTODY_STATUSES
  return hasContract ? signed : unsigned
}
