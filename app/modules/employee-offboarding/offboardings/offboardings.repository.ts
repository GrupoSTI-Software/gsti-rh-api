import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Employee from '#models/employee'
import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeSupplie from '#models/employee_supplie'
import type User from '#models/user'

/** Datos para insertar el expediente (el servicio ya resolvió snapshot y origen). */
export interface EmployeeOffboardingCreateData {
  employeeId: number
  businessUnitId: number
  employeeOffboardingPlannedDate: string
  employeeOffboardingOrigin: string
  employeeOffboardingNotes: string | null
  employeeOffboardingOpenedByUserId: number | null
}

/** Renglón de pendiente a insertar (snapshot de nombre ya resuelto, §7 D9). */
export interface EmployeeOffboardingItemCreateData {
  offboardingConceptId: number | null
  employeeSupplyId: number | null
  employeeOffboardingItemName: string
}

/**
 * Puerto de acceso a datos del expediente de salida (USRH1786568279587).
 * El adaptador MySQL es el ÚNICO que toca Lucid; la transacción se propaga
 * como parámetro `trx`. El aislamiento por empresa va EXPLÍCITO aquí
 * (§7 D1): los modelos del expediente NO componen `withBusinessUnitScope()`.
 */
export interface OffboardingsRepository {
  /**
   * Colaborador dentro del alcance de empresas, resuelto con `withTrashed()`
   * (§7 D3): el expediente sobrevive a la baja. `null` = inexistente o fuera
   * del alcance (404 uniforme).
   */
  findEmployeeInScope(employeeId: number, businessUnitIds: number[]): Promise<Employee | null>

  /**
   * Bloquea la fila de `employees` (`forUpdate`, `withTrashed`) para
   * serializar la apertura del expediente (§7 D6): la fila siempre existe,
   * nunca un gap lock sobre un rango vacío de `employee_offboardings`.
   */
  lockEmployeeRow(
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<Employee | null>

  /** Expediente `open` vivo del colaborador; null si no tiene (regla 1). */
  findOpenByEmployee(
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<EmployeeOffboarding | null>

  /** Inserta el expediente y devuelve su id (dentro de la transacción). */
  createCase(
    data: EmployeeOffboardingCreateData,
    trx: TransactionClientContract
  ): Promise<number>

  /** Insert masivo de pendientes (molde `questionnaire_application_service`). */
  createItems(
    employeeOffboardingId: number,
    rows: EmployeeOffboardingItemCreateData[],
    trx: TransactionClientContract
  ): Promise<void>

  /**
   * Expediente con sus pendientes vivos y el concepto de cada uno resuelto
   * con `withTrashed()` (§7 D8), listo para armar el DTO.
   */
  findByIdWithItems(employeeOffboardingId: number): Promise<EmployeeOffboarding | null>

  /**
   * Insumos del expediente para el diagnóstico de lectura (D-3 de
   * USRH1786568279590): con `withTrashed()` — el borrado lógico no oculta la
   * fila ni su historial de retiro — y filtro EXPLÍCITO por la empresa
   * snapshoteada del expediente.
   */
  findSuppliesByIds(supplyIds: number[], businessUnitId: number): Promise<EmployeeSupplie[]>

  /** Usuarios con su persona, para el nombre visible de la autoría del cumplimiento. */
  findUsersByIds(userIds: number[]): Promise<User[]>

  /**
   * Evidencias vivas por pendiente (extensión aditiva de USRH1786568279593):
   * alimenta `evidenceCount` del DTO; un pendiente sin filas cuenta 0.
   */
  countLiveEvidencesByItemIds(itemIds: number[]): Promise<Map<number, number>>

  /**
   * Listado agregado de salidas (USRH1786568279596, §5.1): una sola
   * sentencia agregada por página más la de conteo total — el número de
   * sentencias NUNCA crece con el número de filas. `todayIso` viaja como
   * binding. El alcance filtra por `eo.business_unit_id` (snapshot del
   * expediente, R11) con `1 = 0` como defensa cuando llega vacío.
   */
  listAggregated(
    filters: OffboardingListFilters,
    businessUnitIds: number[],
    todayIso: string
  ): Promise<{ rows: Record<string, unknown>[]; total: number }>

  /** Expediente vivo por id dentro del alcance; `null` = 404 uniforme. */
  findByIdInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null>

  /**
   * Expediente más reciente del colaborador SIN filtrar por estado (regla 13
   * de USRH1786568279596): respaldo del `by-employee` cuando no hay `open`.
   */
  findMostRecentByEmployee(employeeId: number): Promise<EmployeeOffboarding | null>

  /** Persiste el expediente ya mutado por el servicio (cierre/reapertura). */
  saveCase(offboarding: EmployeeOffboarding): Promise<void>

  /**
   * Colaborador del expediente con `withTrashed()` y sin alcance: para armar
   * el DTO tras cerrar/reabrir, donde el alcance ya se verificó contra el
   * `business_unit_id` snapshoteado del expediente (un prestado puede vivir
   * en otra unidad).
   */
  findEmployeeWithTrashed(employeeId: number): Promise<Employee | null>
}

/** Filtros del listado de salidas (§6.1): exactamente estos, nada más. */
export interface OffboardingListFilters {
  page: number
  limit: number
  search?: string
  status?: string
  overdueOnly?: boolean
}
