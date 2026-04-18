interface EmployeeFilterSearchInterface {
  search: string
  page: number
  limit: number
  departmentId: number | number[]
  positionId: number | number[]
  employeeWorkSchedule: string
  employeeTypeId?: number
  ignoreDiscriminated?: number
  ignoreExternal?: number
  onlyInactive?: boolean | string
  onlyPayroll?: boolean | string
  year?: number
  dateStart?: string
  dateEnd?: string
  userResponsibleId?: number
  orderBy?: 'number' | 'name'
  orderDirection?: 'ascend' | 'descend' | 'Ascendente' | 'Descendente'
  shiftStartTimeInit?: string
  shiftStartTimeEnd?: string
  shiftEndTimeStart?: string
  shiftEndTimeEnd?: string
  exceptionDate?: string
  shiftStartTime?: string
  shiftEndTime?: string
  businessUnitId?: number
  payrollBusinessUnitId?: number
  /**
   * IDs de sucursal (branch_office_id), separados por comas en query: branchNameIds=2,3,4.
   * Filtra empleados con asignación activa a alguna de esas sucursales. Vacío u omitido = sin filtro.
   */
  branchNameIds?: number[]
  /** Si es verdadero, en la respuesta `employeeBusinessEmail` lleva el correo prioritario (usuario > empresa > personal). */
  getMails?: boolean | string | number
}

export type { EmployeeFilterSearchInterface }
