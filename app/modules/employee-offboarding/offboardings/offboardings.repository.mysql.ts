import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'
import EmployeeSupplie from '#models/employee_supplie'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import {
  EMPLOYEE_OFFBOARDING_STATUS,
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
} from './offboardings.constants.js'
import type {
  EmployeeOffboardingCreateData,
  EmployeeOffboardingItemCreateData,
  OffboardingListFilters,
  OffboardingsRepository,
} from './offboardings.repository.js'

/** Nombre completo del colaborador (molde `questionnaire_application_service`). */
const FULL_NAME_EXPRESSION =
  "TRIM(CONCAT(COALESCE(e.employee_first_name, ''), ' ', COALESCE(e.employee_last_name, ''), ' ', COALESCE(e.employee_second_last_name, '')))"

/**
 * Vencidos del expediente (R3 = regla 9 de USRH1786568279587 + la condición
 * `status = 'open'` de USRH1786568279596): pendiente vivo, expediente
 * abierto, fecha de referencia no nula y ya pasada contra "hoy" de negocio
 * (binding `?`, nunca CURDATE(): la conexión MySQL está fijada a UTC).
 */
const OVERDUE_EXPRESSION =
  "COALESCE(SUM(CASE WHEN eoi.employee_offboarding_item_status = 'pending' " +
  "AND eo.employee_offboarding_status = 'open' " +
  'AND COALESCE(e.employee_terminated_date, eo.employee_offboarding_planned_date) IS NOT NULL ' +
  'AND DATE(COALESCE(e.employee_terminated_date, eo.employee_offboarding_planned_date)) < ? THEN 1 ELSE 0 END), 0)'

/**
 * Adaptador MySQL del expediente de salida (USRH1786568279587). Único punto
 * del slice que toca Lucid. El aislamiento por empresa va EXPLÍCITO
 * (`whereIn('business_unit_id', …)`): los modelos del expediente no componen
 * `withBusinessUnitScope()` (§7 D1) porque la apertura automática corre
 * desde caminos sin `TenantContext` (baja de piloto/sobrecargo).
 */
export default class OffboardingsRepositoryMysql implements OffboardingsRepository {
  async findEmployeeInScope(
    employeeId: number,
    businessUnitIds: number[]
  ): Promise<Employee | null> {
    if (businessUnitIds.length === 0) return null
    return await Employee.query()
      .withTrashed()
      .where('employee_id', employeeId)
      .whereIn('business_unit_id', businessUnitIds)
      .first()
  }

  async lockEmployeeRow(
    employeeId: number,
    trx: TransactionClientContract
  ): Promise<Employee | null> {
    return await Employee.query({ client: trx })
      .withTrashed()
      .where('employee_id', employeeId)
      .forUpdate()
      .first()
  }

  async findOpenByEmployee(
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<EmployeeOffboarding | null> {
    return await EmployeeOffboarding.query({ client: trx })
      .where('employee_id', employeeId)
      .where('employee_offboarding_status', EMPLOYEE_OFFBOARDING_STATUS.OPEN)
      .whereNull('employee_offboarding_deleted_at')
      .first()
  }

  async createCase(
    data: EmployeeOffboardingCreateData,
    trx: TransactionClientContract
  ): Promise<number> {
    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const insertResult = await trx.table('employee_offboardings').insert({
      employee_id: data.employeeId,
      business_unit_id: data.businessUnitId,
      employee_offboarding_planned_date: data.employeeOffboardingPlannedDate,
      employee_offboarding_status: EMPLOYEE_OFFBOARDING_STATUS.OPEN,
      employee_offboarding_origin: data.employeeOffboardingOrigin,
      employee_offboarding_notes: data.employeeOffboardingNotes,
      employee_offboarding_opened_by_user_id: data.employeeOffboardingOpenedByUserId,
      employee_offboarding_created_at: now,
      employee_offboarding_updated_at: now,
    })
    return Number(insertResult[0])
  }

  async createItems(
    employeeOffboardingId: number,
    rows: EmployeeOffboardingItemCreateData[],
    trx: TransactionClientContract
  ): Promise<void> {
    if (rows.length === 0) return
    const now = DateTime.utc().toSQL({ includeOffset: false })!
    await trx.table('employee_offboarding_items').insert(
      rows.map((row) => ({
        employee_offboarding_id: employeeOffboardingId,
        offboarding_concept_id: row.offboardingConceptId,
        employee_supply_id: row.employeeSupplyId,
        employee_offboarding_item_name: row.employeeOffboardingItemName,
        employee_offboarding_item_status: EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING,
        employee_offboarding_item_created_at: now,
        employee_offboarding_item_updated_at: now,
      }))
    )
  }

  async findSuppliesByIds(
    supplyIds: number[],
    businessUnitId: number
  ): Promise<EmployeeSupplie[]> {
    if (supplyIds.length === 0) return []
    // `runUnscoped`: el criterio de esta lectura es el BU SNAPSHOTEADO del
    // expediente (filtro explícito de abajo), no el alcance del request.
    // `EmployeeSupplie` compone el mixin de tenant y, con contexto activo,
    // apilaría su whereIn(scope) sobre el filtro explícito: si el
    // colaborador cambió de empresa con expediente abierto, la conjunción
    // quedaría vacía y todo insumo se diagnosticaría 'unavailable'.
    return await TenantContext.runUnscoped(
      async () =>
        await EmployeeSupplie.query()
          .withTrashed()
          .whereIn('employee_supply_id', supplyIds)
          .where('business_unit_id', businessUnitId),
      'diagnóstico de insumos del expediente de salida por su empresa snapshoteada'
    )
  }

  async findUsersByIds(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return []
    // `withTrashed`: la autoría del cumplimiento no debe perder el nombre
    // cuando el usuario se elimina lógicamente después de cumplir.
    return await User.query().withTrashed().whereIn('user_id', userIds).preload('person')
  }

  async countLiveEvidencesByItemIds(itemIds: number[]): Promise<Map<number, number>> {
    if (itemIds.length === 0) return new Map()
    const rows = await EmployeeOffboardingItemEvidence.query()
      .select('employee_offboarding_item_id')
      .whereIn('employee_offboarding_item_id', itemIds)
      .whereNull('employee_offboarding_item_evidence_deleted_at')
      .groupBy('employee_offboarding_item_id')
      .count('* as total')
    return new Map(
      rows.map((row) => [row.employeeOffboardingItemId, Number(row.$extras.total)])
    )
  }

  async findByIdWithItems(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null> {
    // Fail-closed (molde `findEmployeeInScope`): sin alcance no hay consulta
    if (businessUnitIds.length === 0) return null
    // El alcance de empresa va EXPLÍCITO sobre el BU snapshoteado del
    // expediente (defensa en profundidad: no sustituye la validación del
    // llamador, la duplica a propósito). `runUnscoped` solo para el preload
    // del concepto, cuyo modelo compone el mixin de tenant y con contexto
    // activo filtraría por el alcance del request en vez de por el expediente.
    return await TenantContext.runUnscoped(
      async () =>
        await EmployeeOffboarding.query()
          .where('employee_offboarding_id', employeeOffboardingId)
          .whereIn('business_unit_id', businessUnitIds)
          .whereNull('employee_offboarding_deleted_at')
          .preload('items', (itemsQuery) => {
            itemsQuery
              .whereNull('employee_offboarding_item_deleted_at')
              .orderBy('employee_offboarding_item_id', 'asc')
              // El concepto puede estar soft-deleted; sus banderas siguen
              // gobernando el pendiente (§7 D8). El withTrashed vive en la relación.
              .preload('concept')
          })
          .first(),
      'lectura del expediente de salida ya resuelto en alcance; conceptos por FK'
    )
  }

  /**
   * Consulta agregada del listado (§5.1, molde
   * `questionnaire_application_service.baseListAggregatedQuery`). Query
   * builder crudo a propósito: NO aplica el scope de SoftDeletes de Lucid,
   * así los colaboradores dados de baja entran por diseño — nunca se filtra
   * `e.employee_deleted_at` (ni el alcance por la empresa del colaborador).
   */
  private baseAggregatedQuery(
    filters: OffboardingListFilters,
    businessUnitIds: number[],
    todayIso: string
  ) {
    return db
      .from('employee_offboardings as eo')
      .leftJoin('employees as e', 'e.employee_id', 'eo.employee_id')
      .leftJoin('departments as d', 'd.department_id', 'e.department_id')
      .leftJoin('positions as p', 'p.position_id', 'e.position_id')
      .leftJoin('employee_offboarding_items as eoi', (join) => {
        join
          .on('eoi.employee_offboarding_id', 'eo.employee_offboarding_id')
          .andOnNull('eoi.employee_offboarding_item_deleted_at')
      })
      .whereNull('eo.employee_offboarding_deleted_at')
      .if(businessUnitIds.length > 0, (query) => {
        query.whereIn('eo.business_unit_id', businessUnitIds)
      })
      .if(businessUnitIds.length === 0, (query) => {
        // Defensa en profundidad: por API el middleware businessScope nunca
        // deja llegar un alcance vacío (se verifica por lectura de código).
        query.whereRaw('1 = 0')
      })
      .if(!!filters.status, (query) => {
        query.where('eo.employee_offboarding_status', filters.status!)
      })
      .if(!!filters.search, (query) => {
        const searchUpper = filters.search!.toUpperCase()
        query.where((subQuery) => {
          subQuery
            .whereRaw(`UPPER(${FULL_NAME_EXPRESSION}) LIKE ?`, [`%${searchUpper}%`])
            .orWhereRaw('UPPER(e.employee_payroll_code) = ?', [searchUpper])
        })
      })
      .select(
        'eo.employee_offboarding_id as employeeOffboardingId',
        'eo.employee_id as employeeId',
        'eo.employee_offboarding_status as status',
        'eo.employee_offboarding_origin as origin',
        'eo.employee_offboarding_planned_date as plannedDate',
        'eo.employee_offboarding_closed_at as closedAt',
        'eo.employee_offboarding_closed_by_user_id as closedByUserId',
        'e.employee_code as employeeCode',
        'e.employee_payroll_code as employeePayrollCode',
        'e.employee_terminated_date as terminatedDate',
        'e.employee_deleted_at as employeeDeletedAt',
        'd.department_name as departmentName',
        'p.position_name as positionName',
        db.raw(`${FULL_NAME_EXPRESSION} as employeeFullName`),
        db.raw('COUNT(eoi.employee_offboarding_item_id) as itemsTotal'),
        db.raw(
          "COALESCE(SUM(CASE WHEN eoi.employee_offboarding_item_status = 'completed' THEN 1 ELSE 0 END), 0) as itemsCompleted"
        ),
        db.raw(
          "COALESCE(SUM(CASE WHEN eoi.employee_offboarding_item_status = 'pending' THEN 1 ELSE 0 END), 0) as itemsOpen"
        ),
        db.raw(`${OVERDUE_EXPRESSION} as itemsOverdue`, [todayIso])
      )
      // ONLY_FULL_GROUP_BY: todas las columnas no agregadas, una por una
      .groupBy(
        'eo.employee_offboarding_id',
        'eo.employee_id',
        'eo.employee_offboarding_status',
        'eo.employee_offboarding_origin',
        'eo.employee_offboarding_planned_date',
        'eo.employee_offboarding_closed_at',
        'eo.employee_offboarding_closed_by_user_id',
        'e.employee_code',
        'e.employee_payroll_code',
        'e.employee_terminated_date',
        'e.employee_deleted_at',
        'e.employee_first_name',
        'e.employee_last_name',
        'e.employee_second_last_name',
        'd.department_name',
        'p.position_name'
      )
      .if(!!filters.overdueOnly, (query) => {
        // HAVING repite la expresión completa con su binding, nunca el alias
        query.havingRaw(`${OVERDUE_EXPRESSION} > 0`, [todayIso])
      })
  }

  async listAggregated(
    filters: OffboardingListFilters,
    businessUnitIds: number[],
    todayIso: string
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const safePage = Math.max(filters.page, 1)
    const safeLimit = Math.min(Math.max(filters.limit, 1), 100)

    const aggregateQuery = this.baseAggregatedQuery(filters, businessUnitIds, todayIso)
    const totalRow = await db
      .from(aggregateQuery.clone().as('offboardings_aggregate'))
      .count('* as total')
      .first()
    const total = Number((totalRow as { total?: string | number } | undefined)?.total ?? 0)

    const rows = (await aggregateQuery
      .clone()
      // Orden por fecha de referencia (R2) con desempate estable por id
      .orderByRaw(
        'COALESCE(e.employee_terminated_date, eo.employee_offboarding_planned_date) DESC'
      )
      .orderBy('eo.employee_offboarding_id', 'desc')
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit)) as Record<string, unknown>[]

    return { rows, total }
  }

  async findByIdInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeOffboarding.query()
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_offboarding_deleted_at')
      .first()
  }

  async findMostRecentByEmployee(employeeId: number): Promise<EmployeeOffboarding | null> {
    return await EmployeeOffboarding.query()
      .where('employee_id', employeeId)
      .whereNull('employee_offboarding_deleted_at')
      .orderBy('employee_offboarding_created_at', 'desc')
      .orderBy('employee_offboarding_id', 'desc')
      .first()
  }

  async saveCase(offboarding: EmployeeOffboarding): Promise<void> {
    await offboarding.save()
  }

  async findEmployeeWithTrashed(employeeId: number): Promise<Employee | null> {
    // `runUnscoped`: el alcance ya quedó verificado contra el BU snapshoteado
    // del expediente; el mixin de `Employee` ocultaría al prestado de otra
    // empresa y el `withTrashed` conserva al dado de baja (regla 5).
    return await TenantContext.runUnscoped(
      async () => await Employee.query().withTrashed().where('employee_id', employeeId).first(),
      'colaborador del expediente ya autorizado por su BU snapshoteado'
    )
  }
}
