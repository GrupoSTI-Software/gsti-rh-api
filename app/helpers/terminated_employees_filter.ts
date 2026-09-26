/**
 * Replica el predicado que EmployeeService.index / indexToAssigned y
 * EmployeeController.getExcel ya usan para filtrar bajas: solo `true` o
 * la cadena `'true'`. Cualquier otro valor no pide bajas y no exige el
 * segundo permiso.
 */
export function isTerminatedEmployeesFilterRequested(value: unknown): boolean {
  return value === true || value === 'true'
}
