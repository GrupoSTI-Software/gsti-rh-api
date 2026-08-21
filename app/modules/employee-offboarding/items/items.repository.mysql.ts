import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingItem from '#models/employee_offboarding_item'
import EmployeeOffboardingItemEvidence from '#models/employee_offboarding_item_evidence'
import EmployeeSupplie from '#models/employee_supplie'
import OffboardingConcept from '#models/offboarding_concept'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import type { ItemsRepository } from './items.repository.js'

/**
 * Adaptador MySQL del cumplimiento de pendientes (USRH1786568279590).
 * Único punto del slice que toca Lucid. Todos los filtros de empresa van
 * EXPLÍCITOS (D-11); el insumo y el concepto se resuelven con
 * `withTrashed()` — el borrado lógico no oculta la fila ni su historial.
 */
export default class ItemsRepositoryMysql implements ItemsRepository {
  async findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[],
    trx?: TransactionClientContract
  ): Promise<EmployeeOffboarding | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeOffboarding.query({ client: trx })
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_offboarding_deleted_at')
      .first()
  }

  async findItemForUpdate(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingItem | null> {
    return await EmployeeOffboardingItem.query({ client: trx })
      .where('employee_offboarding_item_id', employeeOffboardingItemId)
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereNull('employee_offboarding_item_deleted_at')
      .forUpdate()
      .first()
  }

  async findConceptWithTrashed(
    offboardingConceptId: number,
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<OffboardingConcept | null> {
    // `runUnscoped`: el criterio es el BU del expediente (filtro explícito),
    // no el alcance del request — el mixin de `OffboardingConcept` apilaría
    // su whereIn(scope) y vaciaría la conjunción si el colaborador cambió de
    // empresa con expediente abierto (D-6: las banderas del concepto siguen
    // gobernando el pendiente).
    return await TenantContext.runUnscoped(
      async () =>
        await OffboardingConcept.query({ client: trx })
          .withTrashed()
          .where('offboarding_concept_id', offboardingConceptId)
          .where('business_unit_id', businessUnitId)
          .first(),
      'concepto del pendiente por la empresa snapshoteada del expediente'
    )
  }

  async lockSupplyInScope(
    employeeSupplyId: number,
    businessUnitIds: number[],
    trx: TransactionClientContract
  ): Promise<EmployeeSupplie | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeSupplie.query({ client: trx })
      .withTrashed()
      .where('employee_supply_id', employeeSupplyId)
      .whereIn('business_unit_id', businessUnitIds)
      .forUpdate()
      .first()
  }

  async findSupplyInScope(
    employeeSupplyId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeSupplie | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeSupplie.query()
      .withTrashed()
      .where('employee_supply_id', employeeSupplyId)
      .whereIn('business_unit_id', businessUnitIds)
      .first()
  }

  async saveItem(item: EmployeeOffboardingItem, trx: TransactionClientContract): Promise<void> {
    item.useTransaction(trx)
    await item.save()
  }

  async saveSupply(supply: EmployeeSupplie, trx: TransactionClientContract): Promise<void> {
    supply.useTransaction(trx)
    await supply.save()
  }

  async findUsersByIds(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return []
    // `withTrashed`: la autoría del cumplimiento no debe perder el nombre
    // cuando el usuario se elimina lógicamente después de cumplir.
    return await User.query().withTrashed().whereIn('user_id', userIds).preload('person')
  }

  async findEmployeeWithTrashed(employeeId: number): Promise<Employee | null> {
    // `runUnscoped`: solo se lee la fecha de terminación para el vencido; el
    // alcance ya quedó verificado contra el BU snapshoteado del expediente y
    // el mixin de `Employee` ocultaría al colaborador transferido de empresa.
    return await TenantContext.runUnscoped(
      async () =>
        await Employee.query().withTrashed().where('employee_id', employeeId).first(),
      'fecha de referencia del expediente: colaborador por id ya autorizado'
    )
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
}
