import { BaseSeeder } from '@adonisjs/lucid/seeders'
import {
  upsertRoleBySlug,
  type RoleSeedValues,
} from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Siembra los roles globales que el runtime resuelve por slug: `root`, `owner`
 * y `empleado`.
 *
 * PUENTE, no destino. El rediseño de roles por empresa (owner, admin y employee
 * creados al dar de alta el tenant) está planeado y pendiente de ejecutar;
 * mientras tanto estos tres tienen que existir porque el código vivo los busca
 * por slug y falla en silencio o con 500 si no están:
 *  - `owner`: `SignupDraftService.complete` lo asigna al dueño; sin él, el alta
 *    self-service responde 500 `SIGNUP.ROLE.OWNER_NOT_FOUND.001`.
 *  - `empleado`: `user_controller` bloquea con él el login web del colaborador
 *    y decide `canAccessBackoffice` en la invitación; sin la fila, el bloqueo
 *    NO aplica y el colaborador entra al backoffice. También lo resuelve el
 *    sembrado de datos de práctica del onboarding.
 *  - `root`: cuenta de plataforma (`0008_user_seeder`, `0063`).
 *
 * `super-administrador` y `rh-manager` NO se siembran a propósito. El primero
 * da salvoconducto ampliado, facturación y REPSE a quien lo tenga, y ningún
 * flujo lo necesita para operar; el segundo solo cambia visibilidad y avisos.
 * Ambos quedan reservados (`RESERVED_ROLE_IDENTITY_SLUGS`), así que ningún
 * tenant puede fabricarlos con un nombre. Los specs que los necesitan los
 * aseguran con `tests/helpers/ensure_role.ts`.
 *
 * Ninguno lleva concesiones: `owner` pasa por salvoconducto y `empleado` no
 * debe tener acceso al backoffice.
 *
 * `roleBusinessAccess` va vacío: la visibilidad multi-tenant de `owner` y
 * `empleado` la da `SYSTEM_ROLE_SLUGS`, no el CSV, y atar el CSV al slug de una
 * empresa se rompe si esa empresa se renombra.
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
  {
    roleName: 'Dueño',
    roleSlug: 'owner',
    roleDescription: 'Dueño de la cuenta contratada por autoservicio (acceso total a su empresa)',
    roleActive: 1,
    roleBusinessAccess: '',
  },
  {
    roleName: 'Empleado',
    roleSlug: 'empleado',
    roleDescription: 'Colaborador sin acceso al backoffice',
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
