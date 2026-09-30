import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'
import { isTenantScopeActive } from '#helpers/system_setting_tenant_scope'
import { recordTenantScopeBlock } from '#utils/tenant_scope_block_log'

export { isTenantScopeActive }

/**
 * Corte por empresa para lo que cuelga de un empleado y no lleva marca propia
 * de empresa.
 *
 * `ExceptionRequest` —las solicitudes de permisos del colaborador— no compone
 * el mixin y su tabla no tiene `business_unit_id`: la pertenencia es indirecta,
 * a través del empleado. Sin este corte el listado devolvía paginadas las
 * solicitudes de todas las empresas, y el detalle, la edición y el borrado
 * resolvían por identificador sin comprobar de quién era.
 *
 * Pensada para `query.whereIn('employee_id', scopedEmployeeIds())`, siempre
 * bajo la guarda de `isTenantScopeActive()`.
 */
export function scopedEmployeeIds() {
  if (!TenantContext.isActive()) {
    recordTenantScopeBlock({ table: 'exception_requests', hook: 'fetch' })
  }
  const scope = TenantContext.getScope()

  if (scope.length === 0) {
    // Alcance vacío sin tocar Lucid: `Employee` compone el mixin y fuera de HTTP lanzaría.
    return db.from('employees').select('employee_id').whereRaw('1 = 0')
  }

  return Employee.query()
    .select('employee_id')
    .whereNull('employee_deleted_at')
    .whereIn('business_unit_id', scope)
}
