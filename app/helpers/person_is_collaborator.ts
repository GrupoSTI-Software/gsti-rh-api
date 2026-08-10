import Employee from '#models/employee'

/**
 * Indica si la persona está ligada a un colaborador no eliminado.
 * Usado por la regla de superficie compartida del PermissionGate (Persona).
 * Incluye colaboradores con baja operativa; excluye soft-delete.
 */
export async function personIsCollaborator(personId: number): Promise<boolean> {
  const employee = await Employee.query()
    .whereNull('employee_deleted_at')
    .where('person_id', personId)
    .first()
  return employee !== null
}
