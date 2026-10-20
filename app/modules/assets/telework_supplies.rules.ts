import {
  EMPLOYEE_ASSET_CUSTODY_STATUSES,
  type EmployeeAssetCustodyStatus,
  type OwnEquipmentFeeSource,
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
  TeleworkSuppliesLifecycle,
  TeleworkSuppliesSummary,
  TeleworkSupplyAssetDto,
  TeleworkSupplyCategoryDto,
} from './dto/telework_supplies.dto.js'
import type { OwnEquipmentDeclarationDto } from './dto/own_equipment_declarations.dto.js'

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
 *
 * `ownEquipmentDeclarations` es el punto de extensión del equipo propio
 * (VLRH-H1791306075599): mapea cada categoría a su declaración vigente. Las
 * LLAVES del mapa alimentan a `resolveCategoryStatus` (el estado lo sigue
 * decidiendo la regla pura) y el valor se adjunta como `ownEquipment` a la
 * categoría. Vacío por defecto: los callers existentes no cambian.
 *
 * `lifecycle` (VLRH-H1791493045968, Tarea 6) acompaña a la matriz con el
 * histórico ordenado y la cuota estándar de la empresa; con `applies: false`
 * las vigentes del mapa salen además en `ownEquipmentToClose` para terminarlas.
 * El default deja todo vacío: el resumen por lote construye con él y no cambia.
 */
export function buildEmployeeTeleworkSupplies(
  profile: TeleworkProfile,
  rows: readonly TeleworkCoverageRow[],
  ownEquipmentDeclarations: ReadonlyMap<SupplyTypeTeleworkCategory, OwnEquipmentDeclarationDto> = new Map(),
  lifecycle: TeleworkSuppliesLifecycle = { history: [], feeDefault: null }
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
      ownEquipmentHistory: lifecycle.history,
      ownEquipmentFeeDefault: lifecycle.feeDefault,
      // Quien dejó de aplicar conserva TODAS sus vigentes listadas para
      // terminarlas (incluidas las de un colaborador dado de baja).
      ownEquipmentToClose: [...ownEquipmentDeclarations.values()],
      teleworkSuppliesSummary: emptySummary(),
    }
    return { ...matrix, teleworkSuppliesSummary: summarizeTeleworkSupplies(matrix) }
  }

  const categories = SUPPLY_TYPE_TELEWORK_CATEGORIES.map((category) =>
    buildCategoryDto(
      category,
      ownRows.filter((row) => row.category === category),
      ownEquipmentDeclarations
    )
  ) as [TeleworkSupplyCategoryDto, TeleworkSupplyCategoryDto, TeleworkSupplyCategoryDto]

  const matrix: EmployeeTeleworkSuppliesDto = {
    employeeId: profile.employeeId,
    applies: true,
    isLegallyRequired: applicability.isLegallyRequired,
    teleworkPercentage: profile.teleworkPercentage,
    legalThresholdPercent: TELEWORK_LEGAL_THRESHOLD_PERCENT,
    categories,
    ownEquipmentHistory: lifecycle.history,
    ownEquipmentFeeDefault: lifecycle.feeDefault,
    // Quien aplica no tiene nada que cerrar por dejar de teletrabajar (el tipo lo fija).
    ownEquipmentToClose: [],
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
 *
 * El estado lo decide `resolveCategoryStatus` con las LLAVES del mapa (el
 * mismo origen con el que luego se adjunta `ownEquipment`): en
 * `delivered`/`shipping` la declaración puede existir o no, en
 * `own_equipment` existe por construcción y en `uncovered`/`not_delivered`
 * es `null`.
 */
function buildCategoryDto(
  category: SupplyTypeTeleworkCategory,
  rows: readonly TeleworkCoverageRow[],
  ownEquipmentDeclarations: ReadonlyMap<SupplyTypeTeleworkCategory, OwnEquipmentDeclarationDto>
): TeleworkSupplyCategoryDto {
  const status = resolveCategoryStatus(category, rows, new Set(ownEquipmentDeclarations.keys()))

  if (status === 'delivered' || status === 'shipping') {
    const assets = rows.map(toAssetDto)
    return {
      category,
      status,
      assets: assets as [TeleworkSupplyAssetDto, ...TeleworkSupplyAssetDto[]],
      ownEquipment: ownEquipmentDeclarations.get(category) ?? null,
      // El aviso solo prende con la categoría cubierta y una vigente que sustituir.
      ownEquipmentSuperseded: isOwnEquipmentSuperseded(
        status,
        ownEquipmentDeclarations.has(category)
      ),
    }
  }

  if (status === 'own_equipment') {
    // Cast controlado: `status === 'own_equipment'` solo cuando `category`
    // está en las llaves del mapa (de ahí sale el set que recibió el
    // resolver), así que `get` no es `undefined` por construcción. Nunca `any`.
    return {
      category,
      status,
      assets: [],
      ownEquipment: ownEquipmentDeclarations.get(category) as OwnEquipmentDeclarationDto,
      // El equipo propio no se sustituye a sí mismo: literal `false` (el tipo lo exige).
      ownEquipmentSuperseded: false,
    }
  }

  if (status === 'uncovered' && category !== SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY) {
    return { category, status, assets: [], ownEquipment: null, ownEquipmentSuperseded: false }
  }

  // Inalcanzable por construcción: el resolver solo da `not_delivered` al aditamento, así que `category` ya es ACCESSORY aquí; se deja explícito por la unión discriminada, no como sustitución silenciosa.
  return {
    category: SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY,
    status: 'not_delivered',
    assets: [],
    ownEquipment: null,
    ownEquipmentSuperseded: false,
  }
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

/**
 * Origen de la cuota mensual (regla 5, R2): `default` solo cuando la cuota
 * coincide, al centavo, con la estándar vigente de la empresa; sin estándar o
 * con una cuota distinta el origen es `adjusted`. Comparar centavos
 * (`Math.round(x * 100)`) evita el ruido del punto flotante: nunca igualdad de
 * `number` a pelo.
 */
export function resolveOwnEquipmentFeeSource(
  monthlyFee: number,
  feeDefault: number | null
): OwnEquipmentFeeSource {
  const isDefault =
    feeDefault !== null && Math.round(monthlyFee * 100) === Math.round(feeDefault * 100)

  return isDefault ? 'default' : 'adjusted'
}

/**
 * ¿La categoría la cubre un activo y además el colaborador tiene declaración
 * vigente? (regla 7, R5): el aviso de sustitución solo aplica con la categoría
 * `delivered` o `shipping` —el activo deja obsoleta la declaración— y con una
 * vigente que sustituir. `own_equipment` no se sustituye a sí mismo y los
 * estados sin cobertura no llevan aviso.
 */
export function isOwnEquipmentSuperseded(
  status: TeleworkSupplyCoverageStatus,
  hasOpenDeclaration: boolean
): boolean {
  return hasOpenDeclaration && (status === 'delivered' || status === 'shipping')
}

/**
 * Normaliza un texto opcional de la declaración: recorta los espacios y trata
 * el vacío (y el `null`) como ausencia de valor, para comparar dos versiones.
 */
function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * ¿El ajuste introduce un cambio real? (R5): la cuota se compara en centavos y
 * la descripción y las condiciones normalizadas (`trim`, vacío = `null`), donde
 * un `undefined` hereda el valor vigente. Limpiar las condiciones
 * (`conditions: null` contra un valor vigente) ES un cambio; contra otro vacío,
 * no.
 */
export function hasOwnEquipmentChanges(
  current: { monthlyFee: number; description: string; conditions: string | null },
  input: { monthlyFee: number; description?: string; conditions?: string | null }
): boolean {
  if (Math.round(current.monthlyFee * 100) !== Math.round(input.monthlyFee * 100)) {
    return true
  }

  const nextDescription = input.description ?? current.description
  if (normalizeOptionalText(nextDescription) !== normalizeOptionalText(current.description)) {
    return true
  }

  const nextConditions = input.conditions === undefined ? current.conditions : input.conditions
  return normalizeOptionalText(nextConditions) !== normalizeOptionalText(current.conditions)
}
