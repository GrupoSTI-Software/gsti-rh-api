import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ACCESS_POINT_EMPLOYEE_EVENT_KIND } from '#models/access_point_employee_event'
import AccessPointResyncPending from '#models/access_point_resync_pending'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import {
  ACCESS_POINT_RESYNC_PENDING_STATUSES,
  ACCESS_POINT_RESYNC_RESOLUTION,
  type AccessPointResyncResolution,
} from './resync_pending.constants.js'
import type {
  OpenResyncPendingRow,
  ResyncPendingCandidate,
  ResyncPendingMarkInput,
  ResyncPendingRepository,
} from './resync_pending.repository.js'

const PENDINGS = AccessPointResyncPending.table
const PIVOTS = 'access_point_employees'
const EVENTS = 'access_point_employee_events'
const ACCESS_POINTS = 'access_points'

/**
 * Adaptador MySQL de las marcas (VLRH-H1790812613831). Único punto que toca
 * Lucid; filtra `business_unit_id` explícito en marca, vínculo y checador y no
 * depende del mixin ni de `runUnscoped`. Las lecturas no escriben.
 */
export default class ResyncPendingRepositoryMysql implements ResyncPendingRepository {
  async supersedeStaleOpen(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<number> {
    const stale = await trx
      .from(`${PENDINGS} as r`)
      .join(`${PIVOTS} as ape`, 'ape.access_point_employee_id', 'r.access_point_employee_id')
      .where('r.employee_id', employeeId)
      .where('r.business_unit_id', businessUnitId)
      .whereNull('r.access_point_resync_pending_resolved_at')
      .where((query) => {
        query
          .whereNotNull('ape.access_point_employee_deleted_at')
          .orWhereNotIn('ape.access_point_employee_sync_status', [
            ...ACCESS_POINT_RESYNC_PENDING_STATUSES,
          ])
      })
      .select('r.access_point_resync_pending_id as id')
    if (stale.length === 0) return 0
    await trx
      .from(PENDINGS)
      .whereIn(
        'access_point_resync_pending_id',
        stale.map((row: { id: number }) => row.id)
      )
      .update({
        access_point_resync_pending_resolved_at: DateTime.utc().toSQL({ includeOffset: false }),
        access_point_resync_pending_resolution: ACCESS_POINT_RESYNC_RESOLUTION.SUPERSEDED,
        access_point_resync_pending_updated_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
    return stale.length
  }

  async listRevokedByTermination(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<ResyncPendingCandidate[]> {
    // La fecha de baja se compara en SQL contra la misma fila bloqueada del
    // colaborador: sin convertir zonas horarias en el proceso
    const rows = await trx
      .from(`${PIVOTS} as ape`)
      .where('ape.employee_id', employeeId)
      .where('ape.business_unit_id', businessUnitId)
      .whereNull('ape.access_point_employee_deleted_at')
      .whereIn('ape.access_point_employee_sync_status', [...ACCESS_POINT_RESYNC_PENDING_STATUSES])
      .whereExists((sub) => {
        sub
          .from(`${EVENTS} as ev`)
          .whereRaw('ev.access_point_employee_id = ape.access_point_employee_id')
          .where(
            'ev.access_point_employee_event_kind',
            ACCESS_POINT_EMPLOYEE_EVENT_KIND.REVOKE_REQUESTED
          )
          .whereRaw(
            'ev.access_point_employee_event_created_at >= (SELECT e.employee_deleted_at FROM employees e WHERE e.employee_id = ?)',
            [employeeId]
          )
      })
      .select(
        'ape.access_point_employee_id as accessPointEmployeeId',
        'ape.access_point_employee_sync_status as status'
      )
    return rows.map(
      (row: { accessPointEmployeeId: number; status: AccessPointEmployeeSyncStatus }) => ({
        accessPointEmployeeId: Number(row.accessPointEmployeeId),
        status: row.status,
      })
    )
  }

  async listOpenPivotIds(
    employeeId: number,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<number[]> {
    const rows = await trx
      .from(PENDINGS)
      .where('employee_id', employeeId)
      .where('business_unit_id', businessUnitId)
      .whereNull('access_point_resync_pending_resolved_at')
      .select('access_point_employee_id as id')
    return rows.map((row: { id: number }) => Number(row.id))
  }

  async insertMarks(rows: ResyncPendingMarkInput[], trx: TransactionClientContract): Promise<void> {
    if (rows.length === 0) return
    await AccessPointResyncPending.createMany(
      rows.map((row) => ({
        businessUnitId: row.businessUnitId,
        employeeId: row.employeeId,
        accessPointEmployeeId: row.accessPointEmployeeId,
        accessPointResyncPendingStatusAtMark: row.statusAtMark,
        accessPointResyncPendingMarkedByUserId: row.markedByUserId,
        accessPointResyncPendingResolvedAt: null,
        accessPointResyncPendingResolution: null,
      })),
      { client: trx }
    )
  }

  async resolveOpenForPivot(
    accessPointEmployeeId: number,
    resolution: AccessPointResyncResolution
  ): Promise<void> {
    await db
      .from(PENDINGS)
      .where('access_point_employee_id', accessPointEmployeeId)
      .whereNull('access_point_resync_pending_resolved_at')
      .update({
        access_point_resync_pending_resolved_at: DateTime.utc().toSQL({ includeOffset: false }),
        access_point_resync_pending_resolution: resolution,
        access_point_resync_pending_updated_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
  }

  async listOpenByEmployee(
    employeeId: number,
    businessUnitId: number
  ): Promise<OpenResyncPendingRow[]> {
    const rows = await db
      .from(`${PENDINGS} as r`)
      .join(`${PIVOTS} as ape`, 'ape.access_point_employee_id', 'r.access_point_employee_id')
      .join(`${ACCESS_POINTS} as ap`, 'ap.access_point_id', 'ape.access_point_id')
      .where('r.employee_id', employeeId)
      .where('r.business_unit_id', businessUnitId)
      .whereNull('r.access_point_resync_pending_resolved_at')
      .where('ape.business_unit_id', businessUnitId)
      .whereNull('ape.access_point_employee_deleted_at')
      .whereIn('ape.access_point_employee_sync_status', [...ACCESS_POINT_RESYNC_PENDING_STATUSES])
      .where('ap.business_unit_id', businessUnitId)
      .whereNull('ap.access_point_deleted_at')
      .select(
        'r.access_point_resync_pending_id as accessPointResyncPendingId',
        'r.access_point_employee_id as accessPointEmployeeId',
        'r.access_point_resync_pending_created_at as markedAt',
        'ape.access_point_id as accessPointId',
        'ape.access_point_employee_sync_status as syncStatus',
        'ap.access_point_name as accessPointName'
      )
      .orderBy('ap.access_point_name', 'asc')
      .orderBy('r.access_point_resync_pending_id', 'asc')
    return rows.map(
      (row: {
        accessPointResyncPendingId: number
        accessPointEmployeeId: number
        markedAt: Date | string
        accessPointId: number
        syncStatus: AccessPointEmployeeSyncStatus
        accessPointName: string
      }) => ({
        accessPointResyncPendingId: Number(row.accessPointResyncPendingId),
        accessPointEmployeeId: Number(row.accessPointEmployeeId),
        accessPointId: Number(row.accessPointId),
        accessPointName: String(row.accessPointName),
        syncStatus: row.syncStatus,
        markedAt:
          row.markedAt instanceof Date
            ? DateTime.fromJSDate(row.markedAt, { zone: 'utc' })
            : DateTime.fromSQL(String(row.markedAt), { zone: 'utc' }),
      })
    )
  }
}
