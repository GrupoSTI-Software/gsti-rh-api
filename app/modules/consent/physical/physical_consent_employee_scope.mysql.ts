import Employee from '#models/employee'
import type { PhysicalConsentEmployeeScope } from './physical_consent_employee_scope.js'

/**
 * Implementación Lucid de `PhysicalConsentEmployeeScope`.
 *
 * Scope vacío → `whereRaw('1 = 0')`, fail-closed literal (mismo patrón que
 * `EmployeeLactationPeriodService.findPeriodInCompanyOrFail`, S1): nunca se
 * interpreta "sin unidades permitidas" como "todas permitidas".
 */
export default class PhysicalConsentEmployeeScopeMysql implements PhysicalConsentEmployeeScope {
  async findInScope(employeeId: number, allowedBusinessUnitIds: number[]): Promise<Employee | null> {
    const query = Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .preload('person', (personQuery) => personQuery.preload('user'))

    if (allowedBusinessUnitIds.length > 0) {
      query.whereIn('business_unit_id', allowedBusinessUnitIds)
    } else {
      query.whereRaw('1 = 0')
    }

    return query.first()
  }
}
