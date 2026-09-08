import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import type { AccessPointEmployeeEventKind } from '#models/access_point_employee_event'

export interface SyncEventInput {
  accessPointEmployeeId: number
  businessUnitId: number
  kind: AccessPointEmployeeEventKind
  fromStatus?: string | null
  toStatus?: string | null
  fromPin?: string | null
  toPin?: string | null
  actorUserId?: number | null
  deviceCommandId?: number | null
  detail?: string | null
}

/** Puerto del pivote y su historial. */
export interface EmployeeSyncRepository {
  /**
   * Corre `fn` con la fila del punto de acceso bloqueada. La unicidad del PIN
   * se comprueba dentro: dos altas simultaneas no pueden quedarse con el mismo.
   */
  withDeviceLock<T>(accessPointId: number, fn: () => Promise<T>): Promise<T>
  findPivot(accessPointId: number, employeeId: number): Promise<AccessPointEmployee | null>
  /** Incluye filas revocadas: una reasignacion revive la que ya existia. */
  findPivotWithTrashed(
    accessPointId: number,
    employeeId: number
  ): Promise<AccessPointEmployee | null>
  /** Filas vivas del dispositivo que ocupan ese PIN, incluidas las de cuarentena. */
  findByPin(accessPointId: number, pin: string): Promise<AccessPointEmployee[]>
  listLiveByEmployee(employeeId: number): Promise<AccessPointEmployee[]>
  save(pivot: AccessPointEmployee): Promise<void>
  recordEvent(input: SyncEventInput): Promise<void>
  findByCommandTarget(accessPointEmployeeId: number): Promise<AccessPointEmployee | null>
  updateStatus(
    accessPointEmployeeId: number,
    status: AccessPointEmployeeSyncStatus
  ): Promise<AccessPointEmployee | null>
}
