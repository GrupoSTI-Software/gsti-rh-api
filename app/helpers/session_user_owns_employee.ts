import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'

/**
 * Relación entre la sesión y el colaborador consultado.
 *
 * `terminated` existe porque "no es tuyo" y "es tuyo pero está dado de baja" son
 * hechos distintos y quien pregunta necesita distinguirlos: colapsarlos en un
 * solo `false` hacía que la propia checada de alguien dado de baja se rechazara
 * como asistencia ajena, con un motivo que dice que se arregla dando un permiso.
 */
export type SessionEmployeeOwnership = 'none' | 'active' | 'terminated'

/**
 * Resuelve esa relación. Incluye a los dados de baja a propósito.
 * No usa businessScope: la exención es de identidad, no de unidad.
 */
export async function sessionUserEmployeeOwnership(
  user: User | null | undefined,
  employeeId: number
): Promise<SessionEmployeeOwnership> {
  if (!user?.personId) {
    return 'none'
  }
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return 'none'
  }
  const row = await db
    .from('employees')
    .select('employee_deleted_at')
    .where('employee_id', employeeId)
    .where('person_id', user.personId)
    .first()
  if (!row) {
    return 'none'
  }
  return row.employee_deleted_at ? 'terminated' : 'active'
}

/**
 * Indica si la sesión es el colaborador consultado y sigue activo (app del
 * empleado). Un dado de baja no lo es: quien necesite distinguirlo usa
 * [sessionUserEmployeeOwnership].
 */
export async function sessionUserOwnsEmployee(
  user: User | null | undefined,
  employeeId: number
): Promise<boolean> {
  return (await sessionUserEmployeeOwnership(user, employeeId)) === 'active'
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
