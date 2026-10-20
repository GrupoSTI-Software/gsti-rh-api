import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import type {
  OwnEquipmentDeclarationByEmployee,
  OwnEquipmentDeclarationDto,
  OwnEquipmentDeclarationForChange,
  OwnEquipmentDeclarationInsert,
} from './dto/own_equipment_declarations.dto.js'
import type { OwnEquipmentClosedReason } from './assets.constants.js'

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
  /**
   * Declaración viva por id, acotada al alcance de empresas, con su empresa:
   * es la fila que el ajuste clona (empresa, colaborador y categoría salen de
   * aquí, nunca del body). Con `lock` toma `forUpdate` (solo tiene efecto si
   * `executor` es una transacción). Ajeno, inexistente o dado de baja lógica →
   * `null`, indistinguible.
   */
  findDeclarationForChange(
    executor: OwnEquipmentDbExecutor,
    businessUnitIds: readonly number[],
    declarationId: number,
    options: { lock: boolean }
  ): Promise<OwnEquipmentDeclarationForChange | null>
  /**
   * Cierra la declaración dejando su periodo, su motivo y su autor. Corre
   * dentro de la transacción del término: el `UPDATE` escribe el estado
   * terminal, la fecha de fin, el motivo, el usuario que cierra y la marca de
   * actualización.
   */
  closeDeclaration(
    trx: TransactionClientContract,
    declarationId: number,
    input: { endDate: string; reason: OwnEquipmentClosedReason; userId: number }
  ): Promise<void>
  /**
   * Declaraciones cerradas del colaborador, de TODAS las categorías, con el
   * alcance de empresas dentro de la consulta (R3). Ordena por `end_date` desc
   * y luego por `declaration_id` desc; excluye la vigente y las borradas
   * lógicamente. Alcance vacío → `[]` sin consultar.
   */
  findHistoryByEmployee(
    businessUnitIds: readonly number[],
    employeeId: number
  ): Promise<OwnEquipmentDeclarationDto[]>
}
