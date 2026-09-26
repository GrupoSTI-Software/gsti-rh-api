import type Employee from '#models/employee'

/**
 * Puerto de resolución del empleado dentro del scope de tenant del caller.
 *
 * Separado de `PhysicalConsentRepository` (que solo conoce `user_consents`): permite
 * inyectar un fake en tests unitarios del service sin tocar la tabla `employees`
 * real, y mantiene una única responsabilidad por interfaz.
 */
export interface PhysicalConsentEmployeeScope {
  /**
   * Empleado vivo (`whereNull employee_deleted_at`) dentro de `allowedBusinessUnitIds`,
   * con `person` (y `person.user`) precargado. `null` si no existe, está de baja o
   * queda fuera del scope. Scope vacío → SIEMPRE `null` (fail-closed literal, S1).
   */
  findInScope(employeeId: number, allowedBusinessUnitIds: number[]): Promise<Employee | null>
}
