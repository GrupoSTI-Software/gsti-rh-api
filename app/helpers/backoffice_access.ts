import BusinessUnitUser from '#models/business_unit_user'
import Role from '#models/role'
import type User from '#models/user'

/** Slug del rol de colaborador: el único que no entra al backoffice. */
const EMPLOYEE_ROLE_SLUG = 'empleado'

/**
 * Decide si una cuenta puede entrar al backoffice web.
 *
 * La pregunta cambió al volverse el rol algo del par (empresa, cuenta): ya no
 * basta mirar "el" rol del usuario, porque la misma cuenta puede ser
 * colaboradora en una empresa y administradora en otra. Basta con que en UNA
 * de sus empresas tenga un rol distinto de `empleado` para que el backoffice
 * tenga sentido; qué puede hacer allí adentro ya lo deciden el scope de empresa
 * y el gate, petición por petición.
 *
 * El login ocurre antes de que el cliente elija empresa —no hay header todavía—,
 * así que la decisión se toma sobre todas sus membresías a la vez.
 *
 * Respaldo: si ninguna membresía tiene rol escrito (entorno donde el backfill
 * no ha corrido), manda `users.role_id`, que es el rol único de la etapa
 * anterior. Y si tampoco resuelve a un rol vivo, se deja pasar: el bloqueo es
 * para el colaborador identificado como tal, no para una cuenta cuyo rol no se
 * pudo leer.
 */
export async function canAccessBackoffice(user: User): Promise<boolean> {
  const memberships = await BusinessUnitUser.query()
    .where('user_id', user.userId)
    .whereNotNull('role_id')
    .preload('role')

  const effectiveSlugs = memberships
    .filter((membership) => membership.role && membership.role.deletedAt === null)
    .map((membership) => membership.role.roleSlug)

  if (effectiveSlugs.length > 0) {
    return effectiveSlugs.some((slug) => slug !== EMPLOYEE_ROLE_SLUG)
  }

  const accountRole =
    user.role ??
    (await Role.query().whereNull('role_deleted_at').where('role_id', user.roleId).first())

  if (!accountRole) {
    return true
  }

  return accountRole.roleSlug !== EMPLOYEE_ROLE_SLUG
}
