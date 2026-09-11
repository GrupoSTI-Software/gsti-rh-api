import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { upsertRoleBySlug } from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra los cinco roles base del sistema: `super-administrador`,
 * `rh-manager`, `root`, `empleado` y `owner`.
 *
 * LA IDENTIDAD ES EL SLUG. Ningún rol declara `role_id`: la columna es
 * autoincremental y el número que le toque depende del orden real de siembra
 * en cada instalación. Declararlo a mano fue el bug: este seeder buscaba
 * `role_id = 1` antes que el slug, y como la migración
 * `1788500000000_grant_biometric_face_read_to_admin_roles` crea el rol
 * `kiosco` sin id sobre una tabla vacía, el 1 se lo quedaba `kiosco`; el
 * seeder lo encontraba, concluía que `super-administrador` ya existía y NUNCA
 * lo creaba. Con la búsqueda por slug cada rol se resuelve contra su propia
 * fila y `kiosco` deja de interferir.
 *
 * La búsqueda usa `withTrashed()`: una fila dada de baja ocupa la PK pero el
 * scope de SoftDeletes la oculta, lo que provocaría un INSERT duplicado al
 * re-ejecutar. Nunca se revive un rol retirado: se actualizan sus datos sin
 * tocar `role_deleted_at`.
 *
 * Idempotente: se puede re-ejecutar sin duplicar ni reordenar ids.
 */
export default class extends BaseSeeder {
  /** Roles base. El id lo asigna la BD; la identidad es `roleSlug`. */
  private readonly roles = [
    {
      roleName: 'Super Administrador',
      roleSlug: 'super-administrador',
      roleDescription: 'Administrador',
      roleActive: 1,
      roleBusinessAccess: 'gsti-rh',
    },
    {
      roleName: 'Recursos Humanos',
      roleSlug: 'rh-manager',
      roleDescription: 'Recursos Humanos Manager',
      roleActive: 1,
      roleBusinessAccess: 'gsti-rh',
    },
    {
      roleName: 'Root',
      roleSlug: 'root',
      roleDescription: 'Root',
      roleActive: 1,
      roleBusinessAccess: 'gsti-rh',
    },
    {
      roleName: 'Empleado',
      roleSlug: 'empleado',
      roleDescription: 'Empleado',
      roleActive: 1,
      roleBusinessAccess: 'gsti-rh',
    },
    {
      roleName: 'Dueño',
      roleSlug: 'owner',
      roleDescription: 'Dueño de la cuenta contratada por autoservicio (acceso total a su empresa)',
      roleActive: 1,
      roleBusinessAccess: 'gsti-rh',
    },
  ]

  async run() {
    for (const role of this.roles) {
      await upsertRoleBySlug(role, '0006_role_seeder')
    }
  }
}
