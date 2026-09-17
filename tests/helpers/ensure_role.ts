import Role from '#models/role'
import { upsertRoleBySlug, type RoleSeedValues } from '#helpers/system_catalog_seed_resolver'

/**
 * Roles globales para los specs que prueban reglas ligadas a un slug de rol.
 *
 * Desde 303927d5 `0006_role_seeder` siembra solo `root`. `super-administrador`,
 * `rh-manager`, `empleado` y `owner` ya no existen en una BD recién creada,
 * pero el runtime todavía decide por esos slugs: bypass de `owner` y
 * `super-administrador` en el gate de permisos, rol del alta self-service,
 * guardia de facturación por `owner`. Los specs que ejercitan esas reglas
 * aseguran aquí el rol, por slug y sin id fijo, en lugar de exigir que un
 * seeder lo haya dejado o de apuntar a un id que en cada BD es otro.
 *
 * Contrato:
 *  - `root` no se crea: es de 0006. Si falta, la BD no está sembrada y se lanza.
 *  - Los roles legacy pasan por `upsertRoleBySlug`, el mismo resolver de los
 *    seeders, con los valores que sembraba 0006 antes de 303927d5. Repetir la
 *    llamada no duplica filas ni cambia el id.
 *  - No se borran al terminar: varios specs de la misma corrida los comparten
 *    y sus usuarios de prueba los referencian por FK. La BD de pruebas es
 *    desechable y se recrea con `migration:fresh --seed`.
 *  - Un rol dado de baja lógica no revive (regla del resolver): se lanza en vez
 *    de devolver un rol que el runtime ignora.
 *
 * TEMPORAL: cuando aterrice el rediseño de roles por empresa (owner, admin y
 * employee por tenant), este helper migra a crear el rol dentro de la empresa
 * del spec y los slugs legacy salen de aquí junto con el runtime que los usa.
 */

/** Slugs globales que 0006 dejó de sembrar y que el runtime aún reconoce. */
export type LegacyRoleSlug = 'super-administrador' | 'rh-manager' | 'empleado' | 'owner'

/** Todo rol global que un spec puede pedir: el sembrado (`root`) o uno legacy. */
export type TestRoleSlug = 'root' | LegacyRoleSlug

/** Nombre con el que el resolver etiqueta sus errores. */
const HELPER_NAME = 'tests/helpers/ensure_role'

/** Valores de 0006 previos a 303927d5 (`git show 303927d5^:database/seeders/0006_role_seeder.ts`). */
const LEGACY_ROLE_SEED_VALUES: Record<LegacyRoleSlug, RoleSeedValues> = {
  'super-administrador': {
    roleName: 'Super Administrador',
    roleSlug: 'super-administrador',
    roleDescription: 'Administrador',
    roleActive: 1,
    roleBusinessAccess: 'gsti-rh',
  },
  'rh-manager': {
    roleName: 'Recursos Humanos',
    roleSlug: 'rh-manager',
    roleDescription: 'Recursos Humanos Manager',
    roleActive: 1,
    roleBusinessAccess: 'gsti-rh',
  },
  'empleado': {
    roleName: 'Empleado',
    roleSlug: 'empleado',
    roleDescription: 'Empleado',
    roleActive: 1,
    roleBusinessAccess: 'gsti-rh',
  },
  'owner': {
    roleName: 'Dueño',
    roleSlug: 'owner',
    roleDescription: 'Dueño de la cuenta contratada por autoservicio (acceso total a su empresa)',
    roleActive: 1,
    roleBusinessAccess: 'gsti-rh',
  },
}

/**
 * Devuelve el rol vivo con ese slug, creándolo antes si es legacy y no existe.
 *
 * @param slug  `root` (lo siembra 0006) o un slug legacy que el spec necesita.
 * @throws Error si `root` no está sembrado o si el rol existe dado de baja.
 */
export async function ensureRole(slug: TestRoleSlug): Promise<Role> {
  if (slug !== 'root') {
    await upsertRoleBySlug(LEGACY_ROLE_SEED_VALUES[slug], HELPER_NAME)
  }

  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(
      slug === 'root'
        ? `[${HELPER_NAME}] No existe el rol root: corre "migration:fresh --seed" sobre la BD de pruebas.`
        : `[${HELPER_NAME}] El rol "${slug}" existe dado de baja y el resolver no lo revive.`
    )
  }

  return role
}
