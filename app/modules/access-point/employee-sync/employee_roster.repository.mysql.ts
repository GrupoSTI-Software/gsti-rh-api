import db from '@adonisjs/lucid/services/db'
import type { EmployeeRosterRepository, ForeignEmployeeRow } from './employee_roster.repository.js'

/** Adaptador MySQL del padron del checador: lectura directa, sin el mixin. */
export default class EmployeeRosterRepositoryMysql implements EmployeeRosterRepository {
  async businessUnitNames(businessUnitIds: number[]): Promise<Map<number, string>> {
    if (businessUnitIds.length === 0) return new Map()
    const rows = (await db
      .from('business_units')
      .whereIn('business_unit_id', businessUnitIds)
      .select('business_unit_id', 'business_unit_name')) as Array<{
      business_unit_id: number
      business_unit_name: string
    }>
    return new Map(rows.map((row) => [Number(row.business_unit_id), row.business_unit_name]))
  }

  async foreignEmployees(employeeIds: number[]): Promise<ForeignEmployeeRow[]> {
    if (employeeIds.length === 0) return []
    const rows = (await db
      .from('employees')
      .whereIn('employee_id', employeeIds)
      .select(
        'employee_id',
        'employee_first_name',
        'employee_last_name',
        'employee_second_last_name',
        'employee_photo'
      )) as Array<{
      employee_id: number
      employee_first_name: string | null
      employee_last_name: string | null
      employee_second_last_name: string | null
      employee_photo: string | null
    }>
    return rows.map((row) => ({
      employeeId: Number(row.employee_id),
      firstName: row.employee_first_name,
      lastName: row.employee_last_name,
      secondLastName: row.employee_second_last_name,
      photo: row.employee_photo,
    }))
  }
}
