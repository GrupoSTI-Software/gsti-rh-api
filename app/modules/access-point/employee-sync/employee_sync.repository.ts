import type { DateTime } from 'luxon'
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
  /**
   * PINs que ese equipo ya no puede volver a dar.
   *
   * Cuenta toda fila viva sin importar su estado: una baja confirmada NO
   * devuelve el numero al monton. El equipo sube checadas guardadas cuando
   * estuvo sin red, asi que un marcaje del dueno anterior puede llegar dias
   * despues; si para entonces el numero ya es de otra persona, esa checada se
   * le acredita a quien no la hizo.
   *
   * `exceptPivotId` deja fuera una fila concreta -- la del propio colaborador
   * al que se le esta proponiendo numero. Sin eso nadie podria recuperar el
   * suyo al volver al equipo: su vinculo anterior figura como ocupante.
   */
  listTakenPins(accessPointId: number, exceptPivotId?: number): Promise<string[]>
  listLiveByEmployee(employeeId: number): Promise<AccessPointEmployee[]>
  /**
   * Cuantos deberian estar DENTRO del aparato a una hora dada.
   *
   * Solo los confirmados, y solo si su confirmacion es anterior a esa hora: un
   * alta que salio despues de que el equipo declaro sus contadores todavia no
   * podia estar contada.
   */
  countConfirmedBefore(accessPointId: number, at: DateTime): Promise<number>
  save(pivot: AccessPointEmployee): Promise<void>
  recordEvent(input: SyncEventInput): Promise<void>
  findByCommandTarget(accessPointEmployeeId: number): Promise<AccessPointEmployee | null>
  updateStatus(
    accessPointEmployeeId: number,
    status: AccessPointEmployeeSyncStatus
  ): Promise<AccessPointEmployee | null>
}
