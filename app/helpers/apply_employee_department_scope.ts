import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type Employee from '#models/employee'
import type { EmployeeDepartmentScope } from '#helpers/resolve_employee_role_scope'
import { applyVisibleDepartmentsScope } from '#helpers/apply_visible_departments_scope'

/**
 * Aplica el filtro de departamento a una query de `Employee` según el alcance:
 *
 * - `includeUnassigned = true` → `whereIn(depts) OR whereNull('department_id')`
 *   (usa `applyVisibleDepartmentsScope`).
 * - `includeUnassigned = false` + lista vacía → `whereRaw('1 = 0')` (cero filas).
 * - `includeUnassigned = false` + lista no vacía → `whereIn(depts)`.
 *
 * Es la única representación del criterio de "qué departamentos puede ver
 * este usuario", equivalente a `applyEmployeeRoleScope` del listado principal
 * pero sin el filtro por responsable. Solo se usa en la rama de acceso
 * completo de las siete salidas de USRH1788466831312.
 *
 * @param query Query de `Employee` sobre la que se aplica el criterio.
 * @param scope Alcance con la lista de departamentos y la bandera de sin departamento.
 */
export function applyEmployeeDepartmentScope(
  query: ModelQueryBuilderContract<typeof Employee, Employee>,
  scope: EmployeeDepartmentScope
): void {
  if (scope.includeUnassigned) {
    applyVisibleDepartmentsScope(query, scope.departmentsList)
  } else if (scope.departmentsList.length === 0) {
    query.whereRaw('1 = 0')
  } else {
    query.whereIn('department_id', scope.departmentsList)
  }
}

/**
 * Aplica el mismo criterio que `applyEmployeeDepartmentScope` dentro de un
 * `whereHas('employee', ...)`, donde el tipo del subquery de relación no
 * coincide con `ModelQueryBuilderContract`. Se usa en los seis `whereHas`
 * del servicio de expedientes y vencimientos. USRH1788466831312.
 *
 * @param subQuery Subquery de empleado dentro de un `whereHas`.
 * @param scope Alcance con lista de departamentos y bandera de sin departamento.
 */
export function applyEmployeeDepartmentScopeToSubQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subQuery: any,
  scope: EmployeeDepartmentScope
): void {
  if (scope.includeUnassigned) {
    subQuery.where((q: typeof subQuery) => {
      if (scope.departmentsList.length > 0) {
        q.whereIn('department_id', scope.departmentsList).orWhereNull('department_id')
      } else {
        q.whereNull('department_id')
      }
    })
  } else if (scope.departmentsList.length === 0) {
    subQuery.whereRaw('1 = 0')
  } else {
    subQuery.whereIn('department_id', scope.departmentsList)
  }
}
