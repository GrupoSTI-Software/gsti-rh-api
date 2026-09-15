import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  upsertRoleBySlug,
  type RoleSeedValues,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra el único rol global de una BD limpia: `root`.
 *
 * `super-administrador`, `rh-manager`, `empleado` y `owner` dejaron de sembrarse
 * en 303927d5; el rediseño de roles por empresa está pendiente de decisión. Los
 * specs que todavía los necesitan los aseguran con `tests/helpers/ensure_role.ts`.
 *
 * LA IDENTIDAD ES EL SLUG. Ningún rol declara `role_id`: la columna es
 * autoincremental y el número que le toque depende del orden real de siembra
 * en cada instalación. Declararlo a mano fue el bug: este seeder buscaba
 * `role_id = 1` antes que el slug, y como la migración
 * `1788500000000_grant_biometric_face_read_to_admin_roles` (hoy NO-OP) creaba
 * el rol `kiosco` sin id sobre una tabla vacía, el 1 se lo quedaba `kiosco`; el
 * seeder lo encontraba, concluía que `super-administrador` ya existía y NUNCA
 * lo creaba. Con la búsqueda por slug cada rol se resuelve contra su propia
 * fila.
 *
 * La búsqueda usa `withTrashed()`: una fila dada de baja ocupa la PK pero el
 * scope de SoftDeletes la oculta, lo que provocaría un INSERT duplicado al
 * re-ejecutar. Nunca se revive un rol retirado: se actualizan sus datos sin
 * tocar `role_deleted_at`.
 *
 * Idempotente: se puede re-ejecutar sin duplicar ni reordenar ids.
 */

/**
 * Roles que declara la siembra. El id lo asigna la BD; la identidad es
 * `roleSlug`. Se exporta para que su spec afirme sobre la declaración y no
 * sobre filas: en la suite otros specs ya crearon los roles legacy antes de
 * que corra este seeder, así que comparar filas no detectaría que alguien los
 * volviera a declarar aquí.
 */
export const ROLE_SEEDS: readonly RoleSeedValues[] = [
  {
    roleName: 'Root',
    roleSlug: 'root',
    roleDescription: 'Root',
    roleActive: 1,
    roleBusinessAccess: '',
  },
]

export default class extends BaseSeeder {
  async run() {
    for (const role of ROLE_SEEDS) {
      await upsertRoleBySlug(role, '0006_role_seeder')
    }
  }
}
