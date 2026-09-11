import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'

/** Fila viva del pivote por (dispositivo, PIN). */
export interface PivotMatch {
  accessPointEmployeeId: number
  employeeId: number
  employeeCode: string
  syncStatus: AccessPointEmployeeSyncStatus
}

/** Colaborador candidato por codigo dentro de la empresa. */
export interface EmployeeMatch {
  employeeId: number
  employeeCode: string
  terminated: boolean
}

/** Puerto de lectura de la resolucion del PIN (spec v2, 5.2). */
export interface PinResolverRepository {
  findPivot(accessPointId: number, pin: string): Promise<PivotMatch | null>
  findEmployeesByCode(businessUnitId: number, code: string): Promise<EmployeeMatch[]>
  createInferredPivot(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    pin: string
  }): Promise<void>
}
