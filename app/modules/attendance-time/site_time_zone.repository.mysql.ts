import db from '@adonisjs/lucid/services/db'
import type { EmployeeSiteTimeZoneRow } from './attendance_time.interface.js'
import type { SiteTimeZoneRepository } from './site_time_zone.repository.js'

/**
 * Lectura en MySQL de las zonas configuradas. Usa `db.from` y no los modelos
 * para no pasar por el mixin de empresa: la asistencia se calcula para
 * colaboradores que el llamador ya acotó a su alcance.
 */
export default class SiteTimeZoneRepositoryMysql implements SiteTimeZoneRepository {
  async findForEmployees(employeeIds: number[]): Promise<EmployeeSiteTimeZoneRow[]> {
    const uniqueIds = [...new Set(employeeIds)]
    if (uniqueIds.length === 0) return []

    // Una fila por colaborador: si tuviera varias sucursales base activas, gana
    // la de menor id, el mismo desempate determinista que usa attendance-stats.
    const rows: Array<{
      employee_id: number | string
      branch_office_timezone: string | null
      business_unit_timezone: string | null
    }> = await db
      .from('employees AS e')
      .leftJoin('business_units AS bu', 'bu.business_unit_id', 'e.business_unit_id')
      .leftJoin('employee_branch_offices AS ebo', (join) => {
        join
          .on('ebo.employee_id', 'e.employee_id')
          .andOnVal('ebo.employee_branch_office_active', 1)
      })
      .leftJoin('branch_offices AS bo', (join) => {
        join
          .on('bo.branch_office_id', 'ebo.branch_office_id')
          .andOnNull('bo.branch_office_deleted_at')
      })
      .whereIn('e.employee_id', uniqueIds)
      // Con varias sucursales base activas se conserva solo la de menor id.
      .whereRaw(
        '(ebo.employee_branch_office_id IS NULL OR ebo.employee_branch_office_id = (SELECT MIN(ebo2.employee_branch_office_id) FROM employee_branch_offices ebo2 WHERE ebo2.employee_id = e.employee_id AND ebo2.employee_branch_office_active = 1))'
      )
      .select(
        'e.employee_id AS employee_id',
        'bo.branch_office_timezone AS branch_office_timezone',
        'bu.business_unit_timezone AS business_unit_timezone'
      )

    return rows.map((row) => ({
      employeeId: Number(row.employee_id),
      branchOfficeTimezone: row.branch_office_timezone ?? null,
      businessUnitTimezone: row.business_unit_timezone ?? null,
    }))
  }

  async findForBusinessUnit(businessUnitId: number): Promise<string | null> {
    const row: { business_unit_timezone: string | null } | null = await db
      .from('business_units')
      .where('business_unit_id', businessUnitId)
      .select('business_unit_timezone')
      .first()
    return row?.business_unit_timezone ?? null
  }
}
