import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import type {
  OwnEquipmentDeclarationByEmployee,
  OwnEquipmentDeclarationDto,
  OwnEquipmentDeclarationInsert,
} from './dto/own_equipment_declarations.dto.js'

/**
 * Puerto de la declaración de equipo propio (VLRH-H1791306075599), sin modelo
 * Lucid ni `TenantContext`: el alcance de empresas llega posicional y viaja
 * DENTRO de cada consulta (R3, §13), de modo que el puerto funciona igual en
 * HTTP que fuera de petición (la matriz y la adenda leen por lote).
 */

/**
 * Cliente de BD sobre el que corre una consulta: la conexión global (`db`) o el
 * cliente de una transacción, cuando el alta necesita el candado del colaborador.
 */
export type OwnEquipmentDbExecutor = TransactionClientContract | typeof db

export interface OwnEquipmentDeclarationsRepository {
  /**
   * Colaborador vivo y dentro del alcance para dar de alta su declaración: de
   * su fila sale la empresa (nunca del body). Con `lock` toma `forUpdate` (solo
   * tiene efecto si `executor` es una transacción). Inexistente, ajeno o dado de
   * baja lógica → `null`, indistinguible.
   */
  findEmployeeForDeclaration(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    options: { lock: boolean }
  ): Promise<{ employeeId: number; businessUnitId: number; teleworkPercentage: number } | null>
  /**
   * Si la categoría ya está cubierta por un activo: resguardo abierto (`active`
   * o `shipping`) vivo de un insumo vivo con esa categoría de teletrabajo (R6).
   */
  hasOpenCoverage(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    category: SupplyTypeTeleworkCategory
  ): Promise<boolean>
  /** Si el colaborador ya tiene una declaración vigente de esa categoría (regla 3). */
  hasOpenDeclaration(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    employeeId: number,
    category: SupplyTypeTeleworkCategory
  ): Promise<boolean>
  /** Escribe la fila dentro de la transacción del alta y devuelve su id. */
  insert(trx: TransactionClientContract, row: OwnEquipmentDeclarationInsert): Promise<number>
  /** Declaración viva por id, acotada al alcance de empresas. */
  findById(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    id: number
  ): Promise<OwnEquipmentDeclarationDto | null>
  /**
   * Declaración vigente por lote de colaboradores, con el alcance de empresas
   * dentro de la consulta. Es la que leen la matriz y la adenda. Cualquier
   * argumento vacío → `[]` sin consultar.
   */
  findOpenByEmployees(
    businessUnitIds: readonly number[],
    employeeIds: readonly number[]
  ): Promise<OwnEquipmentDeclarationByEmployee[]>
}
