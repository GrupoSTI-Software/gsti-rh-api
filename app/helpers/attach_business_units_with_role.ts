import Role from '#models/role'
import type User from '#models/user'

/**
 * Liga una cuenta a empresas dejando escrito su rol efectivo en cada una.
 *
 * Punto único del attach al pivote: antes cada vía lo hacía por su cuenta con
 * `related('businessUnits').attach(ids)`, y desde que `business_unit_users`
 * lleva `role_id` cualquier vía que lo omita deja a la cuenta sin rol en esa
 * empresa.
 *
 * El rol se escribe SOLO en las empresas a las que pertenece. En las demás
 * queda NULL, y no es un caso raro: es como se liga la cuenta de plataforma
 * (`root`), que pertenece a empresas sin tener rol dentro de ninguna. La base
 * exige lo mismo desde la FK compuesta
 * `business_unit_users_role_business_unit_foreign`, así que escribir el rol de
 * otra empresa aquí no sería un dato incorrecto: sería un error de inserción.
 *
 * `null` en `roleId` liga sin rol, para quien todavía no tiene uno que escribir.
 */
export async function attachBusinessUnitsWithRole(
  user: User,
  businessUnitIds: readonly number[],
  roleId: number | null
): Promise<void> {
  if (businessUnitIds.length === 0) {
    return
  }

  const role = roleId === null ? null : await Role.find(roleId)
  const roleOwner = role?.businessUnitId ?? null

  const attributes: Record<number, { role_id: number | null }> = {}
  for (const businessUnitId of businessUnitIds) {
    attributes[businessUnitId] = {
      role_id: role !== null && roleOwner === businessUnitId ? role.roleId : null,
    }
  }

  await user.related('businessUnits').attach(attributes)
}
