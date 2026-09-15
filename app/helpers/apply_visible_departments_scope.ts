import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type Employee from '#models/employee'

/**
 * Recorta una query de empleados a los departamentos visibles para quien ve
 * toda la plantilla (`root` o `full-employee-assigned`), **incluyendo a los
 * empleados que no tienen departamento** (USRH1788466831247, reglas 1 y 2).
 *
 * Es la única representación de ese criterio: lo consumen la lista de
 * Empleados, la lista para asignar colaboradores y los destinatarios de un
 * aviso a toda la empresa (regla 7). Se llama solo desde la rama de acceso
 * completo; la rama del acceso restringido no pasa por aquí y no cambia
 * (regla 3).
 *
 * La cláusula va agrupada entre paréntesis para que el `OR` no se escape del
 * resto de la query: la empresa, la búsqueda y las bajas siguen acotando en
 * `AND` (regla 5), también cuando el aviso programado sale con el tenant en
 * bypass. Con `departmentsList` vacía —empresa sin departamentos— Knex
 * compila `1 = 0 OR department_id IS NULL`: se ven los sin departamento y la
 * lista no se vacía.
 *
 * Se conserva el `IN (…)` con los departamentos activos en vez de quitar el
 * filtro: un empleado que apunta a un departamento dado de baja sigue sin
 * verse (regla 8; lo corrige USRH1788466831452).
 *
 * @param query Query de `Employee` a la que se agrega el criterio. Se muta.
 * @param departmentsList Ids de los departamentos activos visibles para el rol.
 * En el camino del aviso programado (tenant en bypass), esta lista puede
 * traer departamentos de varias empresas; quien llama es responsable de
 * acotar por `business_unit_id` aparte — este helper no lo hace.
 */
export function applyVisibleDepartmentsScope(
  query: ModelQueryBuilderContract<typeof Employee>,
  departmentsList: number[]
): void {
  query.where((scoped) => {
    scoped.whereIn('department_id', departmentsList).orWhereNull('department_id')
  })
}
