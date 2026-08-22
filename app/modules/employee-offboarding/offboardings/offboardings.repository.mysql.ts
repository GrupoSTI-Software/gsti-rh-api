import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
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

  async findByIdWithItems(employeeOffboardingId: number): Promise<EmployeeOffboarding | null> {
    return await EmployeeOffboarding.query()
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
      .first()
  }
}
