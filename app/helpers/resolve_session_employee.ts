import type User from '#models/user'
import Employee from '#models/employee'

/**
 * Colaborador detras del usuario de la sesion.
 *
 * El vinculo entre una cuenta y un expediente pasa por la persona: `users` y
 * `employees` apuntan al mismo `person_id`. No hay llave directa entre ambos, y
 * por eso esta resolucion vive en un solo lugar en vez de repetirse en cada
 * controlador que la necesita.
 *
 * Es la pieza que permite que una entrada compartida entre el backoffice y la
 * app deje de confiar en el `employeeId` que manda el cliente: el servidor lo
 * deriva del token y el del cuerpo deja de importar.
 *
 * @param user - Usuario autenticado, o `null` si no hay sesion.
 * @returns El empleado activo ligado a esa cuenta, o `null` si la cuenta no
 *   tiene persona, no tiene expediente o el expediente esta dado de baja.
 */
export async function resolveSessionEmployee(user: User | null | undefined): Promise<Employee | null> {
  if (!user) {
    return null
  }

  if (!user.person) {
    await user.load('person')
  }

  const personId = user.person?.personId

  if (!personId) {
    return null
  }

  return Employee.query()
    .where('person_id', personId)
    .whereNull('employee_deleted_at')
    .first()
}
