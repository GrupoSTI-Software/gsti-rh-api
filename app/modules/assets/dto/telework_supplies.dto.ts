import type {
  EmployeeAssetCustodyStatus,
  OpenAssignmentStatus,
  TeleworkSupplyCoverageStatus,
} from '../assets.constants.js'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'

/**
 * Estados de cobertura que portan resguardos abiertos: la categoría muestra
 * sus activos. `uncovered`, `own_equipment` y `not_delivered` viajan sin
 * activos (la unión discriminada por `status` lo impone a nivel de tipo).
 */
export type CoveringStatus = Extract<TeleworkSupplyCoverageStatus, 'delivered' | 'shipping'>

/** Activo abierto que cubre una categoría en la matriz. */
export interface TeleworkSupplyAssetDto {
  employeeSupplyId: number
  supplyId: number
  name: string
  fileNumber: string
  /** `active`: lo tiene el colaborador; `shipping`: va en camino hacia él. */
  assignmentStatus: OpenAssignmentStatus
  /** `signed` si el resguardo tiene un contrato vivo; `unsigned` si no. */
  custodyStatus: EmployeeAssetCustodyStatus
  /** Fecha de calendario `YYYY-MM-DD` (fecha de asignación o, sin ella, de alta). */
  assignedAt: string
}

/**
 * Una de las tres categorías de la matriz. Unión discriminada por `status`
 * (§11): la imposibilidad de tipo sustituye a la regla — `uncovered` solo
 * puede ser silla o cómputo, y `not_delivered` solo el aditamento; una
 * categoría cubierta (`delivered`/`shipping`) lleva al menos un activo,
 * mientras que el resto viaja con `assets` vacío.
 */
export type TeleworkSupplyCategoryDto =
  | {
      category: SupplyTypeTeleworkCategory
      status: CoveringStatus
      assets: [TeleworkSupplyAssetDto, ...TeleworkSupplyAssetDto[]]
    }
  | {
      category: Extract<SupplyTypeTeleworkCategory, 'ergonomic_chair' | 'computing_equipment'>
      status: 'uncovered'
      assets: []
    }
  | {
      category: Extract<SupplyTypeTeleworkCategory, 'accessory'>
      status: 'not_delivered'
      assets: []
    }
  | {
      category: SupplyTypeTeleworkCategory
      status: 'own_equipment'
      assets: []
    }

/** Conteos por estado de la matriz de un colaborador. */
export interface TeleworkSuppliesSummary {
  deliveredCount: number
  shippingCount: number
  ownEquipmentCount: number
  /** Solo silla y cómputo sin cubrir (el aditamento opcional no cuenta). */
  uncoveredCount: number
  /** Resguardos `active` sin contrato vivo (contados por activo). */
  unsignedCustodyCount: number
}

/**
 * Matriz de cumplimiento de insumos de un colaborador (NOM-037-STPS-2023
 * 5.7). Unión discriminada por `applies` (§11): quien no aplica (presencial,
 * dado de baja o con porcentaje residual) viaja con `categories` vacío y
 * resumen en ceros; quien aplica lleva la tupla de las tres categorías en el
 * orden de la norma.
 */
export type EmployeeTeleworkSuppliesDto =
  | {
      employeeId: number
      applies: false
      isLegallyRequired: false
      teleworkPercentage: number
      legalThresholdPercent: number
      categories: []
      teleworkSuppliesSummary: TeleworkSuppliesSummary
    }
  | {
      employeeId: number
      applies: true
      isLegallyRequired: boolean
      teleworkPercentage: number
      legalThresholdPercent: number
      categories: [
        TeleworkSupplyCategoryDto,
        TeleworkSupplyCategoryDto,
        TeleworkSupplyCategoryDto,
      ]
      teleworkSuppliesSummary: TeleworkSuppliesSummary
    }

/** Perfil mínimo del colaborador que consumen las reglas puras. */
export interface TeleworkProfile {
  employeeId: number
  workSchedule: string
  teleworkPercentage: number
  isDeleted: boolean
}

/** Renglón de cobertura abierta de un insumo, tal como lo produce el repositorio. */
export interface TeleworkCoverageRow {
  employeeId: number
  employeeSupplyId: number
  supplyId: number
  name: string
  fileNumber: string
  assignmentStatus: OpenAssignmentStatus
  category: SupplyTypeTeleworkCategory
  hasContract: boolean
  /** Fecha de calendario `YYYY-MM-DD` (fecha de asignación o, sin ella, de alta). */
  assignedAt: string
}
