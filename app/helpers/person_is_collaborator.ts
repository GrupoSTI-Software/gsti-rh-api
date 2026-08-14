import db from '@adonisjs/lucid/services/db'

/**
 * Indica si la persona está ligada a un colaborador no eliminado.
 * Usado por la regla de superficie compartida del PermissionGate (Persona).
 * Incluye colaboradores con baja operativa; excluye soft-delete.
 */
export async function personIsCollaborator(personId: number): Promise<boolean> {
  // Se consulta sin scope para conservar el gate aunque cambie el contexto de unidad de negocio.
  const employee = await db
    .from('employees')
    .whereNull('employee_deleted_at')
    .where('person_id', personId)
    .first()
  return Boolean(employee)
}
