import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import { PIN_QUARANTINE_STATUSES } from './employee_sync_state.js'
import type { EmployeeSyncRepository, SyncEventInput } from './employee_sync.repository.js'

/** Adaptador Lucid del pivote empleado por dispositivo. */
export default class EmployeeSyncRepositoryMysql implements EmployeeSyncRepository {
  async withDeviceLock<T>(accessPointId: number, fn: () => Promise<T>): Promise<T> {
    return db.transaction(async (trx) => {
      await trx.from('access_points').where('access_point_id', accessPointId).forUpdate().first()
      return fn()
    })
  }

  async findPivot(accessPointId: number, employeeId: number): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .first()
  }

  async findPivotWithTrashed(
    accessPointId: number,
    employeeId: number
  ): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .first()
  }

  /**
   * Quien ocupa ese PIN en el equipo. Incluye las filas en cuarentena: hasta
   * que el aparato confirme el borrado, ese PIN sigue siendo del anterior.
   */
  async findByPin(accessPointId: number, pin: string): Promise<AccessPointEmployee[]> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .where('access_point_employee_pin', pin)
      .where((group) => {
        group
          .whereNull('access_point_employee_deleted_at')
          .orWhereIn('access_point_employee_sync_status', [...PIN_QUARANTINE_STATUSES])
      })
  }

  async listTakenPins(accessPointId: number): Promise<string[]> {
    const rows = await AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .whereNot('access_point_employee_pin', '')
      .where((group) => {
        group
          .whereNull('access_point_employee_deleted_at')
          .orWhereIn('access_point_employee_sync_status', [...PIN_QUARANTINE_STATUSES])
      })
      .select('access_point_employee_pin')

    return rows.map((row) => row.accessPointEmployeePin).filter((pin) => pin.length > 0)
  }

  async listLiveByEmployee(employeeId: number): Promise<AccessPointEmployee[]> {
    return AccessPointEmployee.query().where('employee_id', employeeId)
  }

  async save(pivot: AccessPointEmployee): Promise<void> {
    await pivot.save()
  }

  async recordEvent(input: SyncEventInput): Promise<void> {
    const event = new AccessPointEmployeeEvent()
    event.accessPointEmployeeId = input.accessPointEmployeeId
    event.businessUnitId = input.businessUnitId
    event.accessPointEmployeeEventKind = input.kind
    event.accessPointEmployeeEventFromStatus = input.fromStatus ?? null
    event.accessPointEmployeeEventToStatus = input.toStatus ?? null
    event.accessPointEmployeeEventFromPin = input.fromPin ?? null
    event.accessPointEmployeeEventToPin = input.toPin ?? null
    event.accessPointEmployeeEventActorUserId = input.actorUserId ?? null
    event.deviceCommandId = input.deviceCommandId ?? null
    event.accessPointEmployeeEventDetail = input.detail ?? null
    await event.save()
  }

  async findByCommandTarget(accessPointEmployeeId: number): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_employee_id', accessPointEmployeeId)
      .first()
  }

  async updateStatus(
    accessPointEmployeeId: number,
    status: AccessPointEmployeeSyncStatus
  ): Promise<AccessPointEmployee | null> {
    const pivot = await this.findByCommandTarget(accessPointEmployeeId)
    if (!pivot) return null
    pivot.accessPointEmployeeSyncStatus = status
    if (status === 'sent') pivot.accessPointEmployeeSyncSentAt = DateTime.utc()
    if (status === 'confirmed') pivot.accessPointEmployeeSyncConfirmedAt = DateTime.utc()
    if (status === 'failed' || status === 'revoke_failed') {
      pivot.accessPointEmployeeSyncFailedAt = DateTime.utc()
    }
    await pivot.save()
    return pivot
  }
}
