import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Employee from '#models/employee'
import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingItem from '#models/employee_offboarding_item'
import type EmployeeSupplie from '#models/employee_supplie'
import type OffboardingConcept from '#models/offboarding_concept'
import type User from '#models/user'

/**
 * Puerto de acceso a datos del cumplimiento de pendientes
 * (USRH1786568279590). El adaptador MySQL es el ÚNICO que toca Lucid; la
 * transacción se propaga como parámetro `trx`. Todo filtro de empresa va
 * EXPLÍCITO (D-11): nunca delegado al mixin, que es no-op sin
 * `TenantContext` activo.
 */
export interface ItemsRepository {
  /**
   * Expediente vivo dentro del alcance de empresas, resuelto por su
   * `business_unit_id` snapshoteado — NUNCA por el colaborador (D-10).
   * `null` = inexistente o fuera del alcance (404 uniforme).
   */
  findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[],
    trx?: TransactionClientContract
  ): Promise<EmployeeOffboarding | null>

  /** Pendiente vivo del expediente, bloqueado con `forUpdate` dentro de la transacción. */
  findItemForUpdate(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingItem | null>

  /**
   * Concepto del pendiente CON `withTrashed()` (D-6): pudo eliminarse
   * después de generar el pendiente y sus banderas siguen gobernándolo.
   * Filtro explícito por la empresa del expediente.
   */
  findConceptWithTrashed(
    offboardingConceptId: number,
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<OffboardingConcept | null>

  /**
   * Insumo del pendiente con `withTrashed()` y filtro explícito por el
   * alcance, bloqueado con `forUpdate` (integridad cruzada §12).
   */
  lockSupplyInScope(
    employeeSupplyId: number,
    businessUnitIds: number[],
    trx: TransactionClientContract
  ): Promise<EmployeeSupplie | null>

  /** Insumo para el diagnóstico de lectura (sin bloqueo), con `withTrashed()`. */
  findSupplyInScope(
    employeeSupplyId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeSupplie | null>

  /** Persiste el pendiente ya mutado por el servicio, dentro de la transacción. */
  saveItem(item: EmployeeOffboardingItem, trx: TransactionClientContract): Promise<void>

  /** Persiste el retiro del insumo dentro de la MISMA transacción del pendiente. */
  saveSupply(supply: EmployeeSupplie, trx: TransactionClientContract): Promise<void>

  /** Usuarios con su persona, para el nombre visible de la autoría. */
  findUsersByIds(userIds: number[]): Promise<User[]>

  /**
   * Colaborador del expediente con `withTrashed()` (regla 12): solo para
   * resolver la fecha de referencia del vencido; el alcance ya quedó
   * verificado contra el `business_unit_id` snapshoteado del expediente.
   */
  findEmployeeWithTrashed(employeeId: number): Promise<Employee | null>

  /**
   * Evidencias vivas por pendiente (extensión aditiva de USRH1786568279593):
   * alimenta `evidenceCount` en las respuestas de este slice.
   */
  countLiveEvidencesByItemIds(itemIds: number[]): Promise<Map<number, number>>
}
