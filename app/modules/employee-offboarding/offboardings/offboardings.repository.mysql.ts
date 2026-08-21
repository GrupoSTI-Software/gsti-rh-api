import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
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
  OffboardingsRepository,
} from './offboardings.repository.js'

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

  async findByIdWithItems(employeeOffboardingId: number): Promise<EmployeeOffboarding | null> {
    // `runUnscoped`: el expediente ya se resolvió dentro del alcance por su
    // BU snapshoteado; el concepto de cada pendiente viaja por FK y su
    // modelo compone el mixin de tenant, que con contexto activo filtraría
    // el preload por el alcance del request en vez de por el expediente.
    return await TenantContext.runUnscoped(
      async () =>
        await EmployeeOffboarding.query()
          .where('employee_offboarding_id', employeeOffboardingId)
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
}
