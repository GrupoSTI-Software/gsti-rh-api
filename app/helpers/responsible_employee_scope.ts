/**
 * Roles que ven toda la plantilla de su empresa sin el candado de
 * colaboradores a cargo: `root` (plataforma) y `owner` (dueño de la empresa,
 * con el mismo bypass que ya tiene en el gate de `RoleService.hasAccess`).
 * El aislamiento entre empresas no depende de esto: lo pone el middleware de
 * scope por empresa.
 */
const FULL_STAFF_ROLE_SLUGS: readonly string[] = ['root', 'owner']

interface ResponsibleScopeUser {
  userId: number
  role: { roleSlug: string }
}

/**
 * Usuario con el que se acota una consulta de colaboradores a los que tiene a
 * cargo (`user_responsible_employees`).
 *
 * @returns `null` cuando no aplica el candado (root, owner o sin sesión);
 *   el `userId` de la sesión en cualquier otro caso.
 */
export function resolveResponsibleUserId(user: ResponsibleScopeUser | undefined): number | null {
  if (!user || FULL_STAFF_ROLE_SLUGS.includes(user.role.roleSlug)) {
    return null
  }
  return user.userId
}
