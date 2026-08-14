import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'

/**
 * Indica si la sesión es el colaborador consultado (app del empleado).
 * No usa businessScope: la exención es de identidad, no de unidad.
 */
export async function sessionUserOwnsEmployee(
  user: User | null | undefined,
  employeeId: number
): Promise<boolean> {
  if (!user?.personId) {
    return false
  }
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return false
  }
  const row = await db
    .from('employees')
    .whereNull('employee_deleted_at')
    .where('employee_id', employeeId)
    .where('person_id', user.personId)
    .first()
  return Boolean(row)
}

export function sessionUserOwnsPerson(
  user: User | null | undefined,
  personId: number
): boolean {
  if (!user?.personId) {
    return false
  }
  return Number(user.personId) === Number(personId)
}
