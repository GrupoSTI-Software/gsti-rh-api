interface EmployeeVacationExcelFilterInterface {
  search: string
  employeeId: number
  departmentId: number
  positionId: number
  filterStartDate: string
  filterEndDate: string
  onlyInactive: boolean | string
  userResponsibleId?: number
  onlyOneYear: boolean | string
  /**
   * Solo el período que abre en el año de `filterStartDate`, aunque el rango
   * termine el año siguiente. Lo usa la ficha del empleado para exportar el
   * período elegido con su rango completo en el título.
   */
  periodOnly?: boolean | string
  businessUnitId: number
  payrollBusinessUnitId?: number
}
export type { EmployeeVacationExcelFilterInterface }
