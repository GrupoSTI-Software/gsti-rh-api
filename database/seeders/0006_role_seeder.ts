import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  upsertRoleBySlug,
  type RoleSeedValues,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra los roles de una base nueva.
 *
 * Aquí va SOLO el rol global de la plataforma: `root`, sin empresa dueña. El
 * juego propio de cada empresa (dueño, administrador y colaborador) lo siembra
 * `0064_tenant_roles_seeder`, que corre después del catálogo de módulos y
 * permisos porque el administrador nace con ese catálogo puesto.
 *
 * `owner` y `empleado` ya NO se siembran como filas globales. Lo fueron
 * mientras el runtime los resolvía por slug sin saber de qué empresa hablaba;
 * desde que el rol cuelga del par (empresa, cuenta), una fila global de `owner`
 * es justo lo que hace falta evitar: el dueño de un cliente no puede ser el
 * mismo registro que el de otro. `root` se queda global porque no pertenece a
 * ninguna empresa: es la cuenta de GSTI.
 *
 * `super-administrador` y `rh-manager` NO se siembran, como antes: el primero
 * da salvoconducto ampliado, facturación y REPSE a quien lo tenga, y ningún
 * flujo lo necesita para operar. Ambos siguen reservados
 * (`RESERVED_ROLE_IDENTITY_SLUGS`), así que ningún tenant puede fabricarlos con
 * un nombre. Los specs que los necesitan los aseguran con
 * `tests/helpers/ensure_role.ts`.
 *
 * LA IDENTIDAD ES EL SLUG. Ningún rol declara `role_id`: la columna es
 * autoincremental y el número que le toque depende del orden real de siembra en
 * cada instalación.
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
