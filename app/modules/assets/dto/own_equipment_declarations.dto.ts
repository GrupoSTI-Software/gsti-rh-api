import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import type {
  OwnEquipmentClosedReason,
  OwnEquipmentDeclarationStatus,
  OwnEquipmentFeeSource,
} from '../assets.constants.js'

/**
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599 y
 * VLRH-H1791493045968).
 *
 * Contrato del módulo, sin HTTP: el DTO que sale al API y la fila que el puerto
 * escribe. Sin modelo Lucid: la tabla se lee y escribe por `db.from`/`db.table`.
 */

/**
 * Declaración tal como sale al API (§11). Sin `businessUnitId` ni la llave del
 * archivo: la empresa nunca sale y `..._file` es privada (la evidencia es de la
 * hermana C) — de ella solo se delata `hasEvidence`. `monthlyFee` es número (el
 * DECIMAL llega como texto) y las fechas son civiles serializadas
 * (`YYYY-MM-DD` / ISO). `endDate` y `closedReason` solo traen valor en la
 * versión cerrada y `feeSource` dice si la cuota es la estándar (`default`) o la
 * capturó RH (`adjusted`).
 */
export interface OwnEquipmentDeclarationDto {
  declarationId: number
  employeeId: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
  endDate: string | null
  monthlyFee: number
  feeSource: OwnEquipmentFeeSource
  status: OwnEquipmentDeclarationStatus
  closedReason: OwnEquipmentClosedReason | null
  /**
   * Si la declaración tiene evidencia adjunta (VLRH-H1791493046616, §14): la
   * única señal que sale al API de `..._file`. Un archivo vacío o solo espacios
   * no cuenta, y la key NUNCA viaja en el DTO (R3).
   */
  hasEvidence: boolean
  createdAt: string
}

/**
 * Fila que el puerto inserta. La empresa sale de la fila del colaborador ya
 * filtrado por alcance, nunca del body; `feeSource` lo calcula el servidor con
 * `resolveOwnEquipmentFeeSource` (R2/CA-19: sin cuota estándar es `adjusted`) y
 * `status` nace `active`.
 */
export interface OwnEquipmentDeclarationInsert {
  employeeId: number
  businessUnitId: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
  monthlyFee: number
  feeSource: OwnEquipmentFeeSource
  createdByUserId: number
  /**
   * Key del objeto de la evidencia en S3 (VLRH-H1791493046616, §14). OPCIONAL:
   * la trae el alta cuando viene archivo (Tarea 3); el ajuste y el término no
   * la tocan y el adaptador escribe `row.file ?? null`, así que la versión
   * nueva del ajuste nace sin evidencia de facto (regla 5).
   */
  file?: string | null
}

/**
 * Declaración vigente con la empresa, tal como la necesita el ajuste (Tarea 4):
 * la versión nueva clona `businessUnitId`, `employeeId` y `category` de esta
 * fila —nunca del body— y el candado decide con `status`.
 */
export interface OwnEquipmentDeclarationForChange {
  declarationId: number
  employeeId: number
  businessUnitId: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
  monthlyFee: number
  status: OwnEquipmentDeclarationStatus
}

/** Declaración vigente de un colaborador, para la matriz y la adenda por lote. */
export interface OwnEquipmentDeclarationByEmployee {
  employeeId: number
  declaration: OwnEquipmentDeclarationDto
}
