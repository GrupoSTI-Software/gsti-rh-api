interface EmployeeFilterSearchInterface {
  search: string
  page: number
  limit: number
  departmentId: number
  positionId: number
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
}

export type { EmployeeFilterSearchInterface }
