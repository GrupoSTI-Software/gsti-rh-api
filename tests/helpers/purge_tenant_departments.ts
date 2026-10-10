import db from '@adonisjs/lucid/services/db'

/**
 * Borra los departamentos de una empresa de prueba y sus filas en `role_departments`.
 *
 * El alta de una empresa siembra su departamento raíz (`DepartmentProvisioningService`) y lo asigna a
 * los roles del tenant; sin esta limpieza, borrar esos roles o la empresa choca con las llaves foráneas
 * de `role_departments.department_id` y `departments.business_unit_id`. Llamar antes de borrar roles.
 *
 * @param businessUnitId Empresa del fixture.
 */
export async function purgeTenantDepartments(businessUnitId: number): Promise<void> {
  const rows = await db.from('departments').where('business_unit_id', businessUnitId).select('department_id')
  const departmentIds = rows.map((row: { department_id: number }) => row.department_id)
  if (departmentIds.length === 0) return
  await db.from('role_departments').whereIn('department_id', departmentIds).delete()
  await db.from('departments').whereIn('department_id', departmentIds).delete()
}
