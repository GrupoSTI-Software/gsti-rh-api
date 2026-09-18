import type User from '#models/user'

/**
 * Liga una cuenta a empresas dejando escrito su rol efectivo en cada una.
 *
 * Punto único del attach al pivote: antes cada vía lo hacía por su cuenta con
 * `related('businessUnits').attach(ids)`, y desde que `business_unit_users`
 * lleva `role_id` cualquier vía que lo omita deja a la cuenta sin rol en esa
 * empresa —es decir, dependiendo del respaldo `users.role_id`, que es justo lo
 * que se está retirando—.
 *
 * `roleId` es el rol que la cuenta tendrá en TODAS las empresas de la llamada.
 * Es lo correcto en cada uno de los usos vivos: el alta liga a la cuenta con
 * una sola empresa, y las altas masivas (demo, root) reparten el mismo rol a
 * todas a propósito. Un rol distinto por empresa se escribe con una llamada
 * por empresa.
 *
 * `null` deja la columna vacía y la decisión en manos del respaldo; se usa solo
 * donde todavía no hay rol que escribir.
 */
export async function attachBusinessUnitsWithRole(
  user: User,
  businessUnitIds: readonly number[],
  roleId: number | null
): Promise<void> {
  if (businessUnitIds.length === 0) {
    return
  }

  if (roleId === null) {
    await user.related('businessUnits').attach([...businessUnitIds])
    return
  }

  const attributes: Record<number, { role_id: number }> = {}
  for (const businessUnitId of businessUnitIds) {
    attributes[businessUnitId] = { role_id: roleId }
  }

  await user.related('businessUnits').attach(attributes)
}
