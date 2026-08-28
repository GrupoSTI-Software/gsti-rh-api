import db from '@adonisjs/lucid/services/db'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

export {
  createActor,
  cleanupActor,
  createSensitiveFixture,
  cleanupSensitiveFixture,
  buHeader,
  CLEAR_FIXED,
  createSystemActor,
  cleanupSystemActor,
} from '../employees/sensitive_read_by_category_support.js'
export type {
  TenantActor,
  SystemActor,
  SensitiveFixture,
  ClearPii,
} from '../employees/sensitive_read_by_category_support.js'

/**
 * Concede permisos de varios módulos al mismo rol en una sola operación,
 * reemplazando por completo sus permisos previos. A diferencia de `grantOnly`
 * (un solo módulo, `employees` fijo), esta HU exige conceder categorías
 * legales (`employees`) y bitácora (`sensitive-data-access-log`) al mismo
 * actor sin perder ninguna de las dos.
 */
export async function grantAcrossModules(
  roleId: number,
  grants: { module: string; slugs: string[] }[]
) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const { module, slugs } of grants) {
    for (const slug of slugs) {
      const permission = await SystemPermission.query()
        .whereNull('system_permission_deleted_at')
        .where('system_permission_slug', slug)
        .whereHas('systemModule', (query) =>
          query.whereNull('system_module_deleted_at').where('system_module_slug', module)
        )
        .first()
      if (!permission) {
        throw new Error(`Se requiere el permiso "${module}:${slug}" en BD para este test.`)
      }
      await RoleSystemPermission.create({
        roleId,
        systemPermissionId: permission.systemPermissionId,
      })
    }
  }
}

/**
 * Cuenta filas de auditoría de un trío modelo/columna/recordId — oráculo
 * de "el 403 no escribe asiento" (CA-2).
 */
export async function countRevealLogs(
  model: string,
  column: string,
  recordId: number
): Promise<number> {
  const row = await db
    .from('pii_access_logs')
    .where('pii_access_log_model', model)
    .where('pii_access_log_model_column', column)
    .where('pii_access_log_record_id', recordId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

/**
 * Borra asientos de revelado creados por la suite. `pii_access_logs` tiene
 * FK a `users.user_id` y `business_units.business_unit_id`; sin este paso
 * `cleanupActor` / `cleanupSystemActor` fallan al borrar el actor.
 */
export async function cleanupRevealLogs(filters: {
  userId?: number
  businessUnitId?: number
}) {
  if (filters.userId === undefined && filters.businessUnitId === undefined) {
    throw new Error('cleanupRevealLogs requiere userId o businessUnitId')
  }
  const logsQuery = db.from('pii_access_logs')
  if (filters.userId !== undefined) {
    logsQuery.where('user_id', filters.userId)
  }
  if (filters.businessUnitId !== undefined) {
    logsQuery.where('business_unit_id', filters.businessUnitId)
  }
  const rows = await logsQuery.select('pii_access_log_id')
  const ids = rows.map((row) => Number(row.pii_access_log_id))
  if (ids.length === 0) return
  await db.from('pii_access_log_subjects').whereIn('pii_access_log_id', ids).delete()
  await db.from('pii_access_logs').whereIn('pii_access_log_id', ids).delete()
}
