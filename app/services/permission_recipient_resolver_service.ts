import db from '@adonisjs/lucid/services/db'
import { PLATFORM_ROLE_SLUG } from '#constants/system_roles'
import type { TenantRoleSlug } from '#constants/tenant_provisioned_roles'

/** A quién buscar: quien tiene `action` sobre `module` en `businessUnitId`. */
export interface PermissionRecipientQuery {
  businessUnitId: number
  module: string
  action: string
}

interface RecipientRow {
  userId: number
  email: string
}

/** Dueño de la empresa: ve su asistencia sin necesitar filas de permiso. */
const OWNER_ROLE_SLUG = 'owner' satisfies TenantRoleSlug

/**
 * Correos de quienes, en una empresa, tienen un permiso del catálogo de módulos
 * (VLRH-H1791056340278).
 *
 * El permiso se evalúa con el rol efectivo de la membresía en ESA empresa, con
 * el mismo criterio que `ownerMembershipsQuery` de
 * `app/modules/consent/platform/platform_consent.repository.mysql.ts`: manda
 * `business_unit_users.role_id`; si es NULL, el respaldo `users.role_id` solo
 * cuenta cuando el rol es de esa empresa o global. El dueño entra aunque no
 * tenga filas de permiso. Las cuentas de plataforma (`root` o
 * `users.is_platform_admin`) nunca entran: dan soporte, no son RH del cliente.
 *
 * Fail-closed: una cuenta inactiva o borrada, una membresía borrada, un rol
 * inactivo o borrado, o un correo vacío la dejan fuera.
 *
 * Usa `db.from` con la empresa explícita: corre fuera de HTTP, donde el mixin
 * de alcance por empresa de los modelos lanza.
 */
export default class PermissionRecipientResolverService {
  /** Correos en minúsculas, un ejemplar por dirección, en orden de `user_id`. */
  async resolveEmails(query: PermissionRecipientQuery): Promise<string[]> {
    const rows = (await db
      .from('business_unit_users as buu')
      .innerJoin('users as u', (join) => {
        join.on('u.user_id', 'buu.user_id').andOnNull('u.user_deleted_at')
      })
      .innerJoin('business_units as bu', (join) => {
        join
          .on('bu.business_unit_id', 'buu.business_unit_id')
          .andOnVal('bu.business_unit_active', '=', 1)
          .andOnNull('bu.business_unit_deleted_at')
      })
      .leftJoin('roles as pr', (join) => {
        join.on('pr.role_id', 'buu.role_id').andOnNull('pr.role_deleted_at')
      })
      .leftJoin('roles as br', (join) => {
        join
          .on('br.role_id', 'u.role_id')
          .andOnNull('br.role_deleted_at')
          .andOn((own) => {
            own.onNull('br.business_unit_id').orOn('br.business_unit_id', 'buu.business_unit_id')
          })
      })
      .where('buu.business_unit_id', query.businessUnitId)
      .whereNull('buu.business_unit_user_deleted_at')
      .where('u.user_active', 1)
      .where('u.is_platform_admin', 0)
      .whereNotNull('u.user_email')
      .whereRaw("TRIM(u.user_email) <> ''")
      // Rol efectivo: el de la pivote si existe; si no, el de la cuenta.
      .whereRaw('IF(buu.role_id IS NOT NULL, pr.role_id, br.role_id) IS NOT NULL')
      // La cuenta de plataforma entra a cualquier empresa para dar soporte, pero
      // no es RH de ninguna.
      .whereRaw("COALESCE(IF(buu.role_id IS NOT NULL, pr.role_slug, br.role_slug), '') <> ?", [
        PLATFORM_ROLE_SLUG,
      ])
      .whereRaw('COALESCE(IF(buu.role_id IS NOT NULL, pr.role_active, br.role_active), 0) = 1')
      .where((grant) => {
        grant
          .whereRaw('IF(buu.role_id IS NOT NULL, pr.role_slug, br.role_slug) = ?', [OWNER_ROLE_SLUG])
          .orWhereExists((permission) => {
            permission
              .from('role_system_permissions as rsp')
              .innerJoin('system_permissions as sp', (join) => {
                join
                  .on('sp.system_permission_id', 'rsp.system_permission_id')
                  .andOnNull('sp.system_permission_deleted_at')
                  .andOnVal('sp.system_permission_slug', '=', query.action)
              })
              .innerJoin('system_modules as sm', (join) => {
                join
                  .on('sm.system_module_id', 'sp.system_module_id')
                  .andOnNull('sm.system_module_deleted_at')
                  .andOnVal('sm.system_module_active', '=', 1)
                  .andOnVal('sm.system_module_slug', '=', query.module)
              })
              .whereNull('rsp.role_system_permission_deleted_at')
              .whereRaw('rsp.role_id = IF(buu.role_id IS NOT NULL, pr.role_id, br.role_id)')
              .select(db.raw('1'))
          })
      })
      .distinct('u.user_id as userId', 'u.user_email as email')
      .orderBy('u.user_id', 'asc')) as RecipientRow[]

    const seen = new Set<string>()
    const emails: string[] = []
    for (const row of rows) {
      const email = row.email.trim().toLowerCase()
      if (email === '' || seen.has(email)) continue
      seen.add(email)
      emails.push(email)
    }
    return emails
  }
}
