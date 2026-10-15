import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'

/**
 * Declaración del uso de equipo propio con su cuota (VLRH-H1791306075599).
 *
 * Contrato del módulo, sin HTTP: el DTO que sale al API y la fila que el puerto
 * escribe. Sin modelo Lucid: la tabla se lee y escribe por `db.from`/`db.table`.
 */

/**
 * Declaración tal como sale al API (§11). Sin `businessUnitId` ni la llave del
 * archivo: la empresa nunca sale y `..._file` es privada (la evidencia es de la
 * hermana C). `monthlyFee` es número (el DECIMAL llega como texto) y `startDate`
 * y `createdAt` son fechas serializadas (`YYYY-MM-DD` / ISO).
 */
export interface OwnEquipmentDeclarationDto {
  declarationId: number
  employeeId: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
  monthlyFee: number
  status: 'active' | 'closed'
  createdAt: string
}

/**
 * Fila que el puerto inserta. La empresa sale de la fila del colaborador ya
 * filtrado por alcance, nunca del body; `feeSource` lo fija el servidor
 * (`adjusted`) y `status` nace `active`.
 */
export interface OwnEquipmentDeclarationInsert {
  employeeId: number
  businessUnitId: number
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
  monthlyFee: number
  feeSource: 'adjusted'
  createdByUserId: number
}

/** Declaración vigente de un colaborador, para la matriz y la adenda por lote. */
export interface OwnEquipmentDeclarationByEmployee {
  employeeId: number
  declaration: OwnEquipmentDeclarationDto
}
