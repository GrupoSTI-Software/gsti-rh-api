import type {
  EmployeeAssetCustodyStatus,
  OpenAssignmentStatus,
  TeleworkSupplyCoverageStatus,
} from '../assets.constants.js'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import type { OwnEquipmentDeclarationDto } from './own_equipment_declarations.dto.js'

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
 *
 * `ownEquipment` viaja por variante (§11): la declaración vigente cuando la
 * categoría la tiene —`delivered`/`shipping` aunque el activo mande en el
 * estado—, nunca `null` en `own_equipment` (la declaración la produjo) y
 * siempre `null` en `uncovered` y `not_delivered`.
 */
export type TeleworkSupplyCategoryDto =
  | {
      category: SupplyTypeTeleworkCategory
      status: CoveringStatus
      assets: [TeleworkSupplyAssetDto, ...TeleworkSupplyAssetDto[]]
      ownEquipment: OwnEquipmentDeclarationDto | null
      /**
       * `true` solo cuando el activo deja obsoleta una declaración vigente
       * (regla 7, R5): el aviso no compila sobre una categoría no cubierta.
       */
      ownEquipmentSuperseded: boolean
    }
  | {
      category: Extract<SupplyTypeTeleworkCategory, 'ergonomic_chair' | 'computing_equipment'>
      status: 'uncovered'
      assets: []
      ownEquipment: null
      ownEquipmentSuperseded: false
    }
  | {
      category: Extract<SupplyTypeTeleworkCategory, 'accessory'>
      status: 'not_delivered'
      assets: []
      ownEquipment: null
      ownEquipmentSuperseded: false
    }
  | {
      category: SupplyTypeTeleworkCategory
      status: 'own_equipment'
      assets: []
      ownEquipment: OwnEquipmentDeclarationDto
      ownEquipmentSuperseded: false
    }

/**
 * Resumen de la matriz de un colaborador (§11): además de los conteos por
 * estado reporta si le aplica la matriz y si el teletrabajo es obligatorio
 * —los cinco HUs consumidores leen solo este resumen, nunca la matriz.
 */
export interface TeleworkSuppliesSummary {
  /** Si el colaborador aplica a la matriz (modalidad, porcentaje y alta). */
  applies: boolean
  /** Si su porcentaje alcanza el umbral legal inclusivo (R4). */
  isLegallyRequired: boolean
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
      /** Cerradas del colaborador (todas las categorías), fin desc y luego id desc. */
      ownEquipmentHistory: OwnEquipmentDeclarationDto[]
      /** Cuota estándar vigente de la empresa; `null` = sin fila de ajustes. */
      ownEquipmentFeeDefault: number | null
      /** Vigentes del colaborador (todas las categorías): quién ya no teletrabaja las termina. */
      ownEquipmentToClose: OwnEquipmentDeclarationDto[]
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
      /** Cerradas del colaborador (todas las categorías), fin desc y luego id desc. */
      ownEquipmentHistory: OwnEquipmentDeclarationDto[]
      /** Cuota estándar vigente de la empresa; `null` = sin fila de ajustes. */
      ownEquipmentFeeDefault: number | null
      /** Quien aplica no tiene nada que cerrar por dejar de teletrabajar. */
      ownEquipmentToClose: []
      teleworkSuppliesSummary: TeleworkSuppliesSummary
    }

/**
 * Ciclo de vida del equipo propio que acompaña a la matriz (Tarea 6): el
 * histórico ordenado del colaborador y la cuota estándar de su empresa. El
 * resumen por lote NO lo consume (ni histórico ni cuota en el lote).
 */
export interface TeleworkSuppliesLifecycle {
  history: OwnEquipmentDeclarationDto[]
  feeDefault: number | null
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
