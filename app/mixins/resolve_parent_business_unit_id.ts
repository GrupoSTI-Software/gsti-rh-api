/**
 * Helper para hooks `@beforeCreate` de defensa en profundidad (ESB-07-08-03-08).
 *
 * Los modelos hijo que reciben su propia columna `business_unit_id` nunca
 * deben confiar en un valor enviado por el cliente: se resuelve siempre
 * desde el registro padre (que, al estar también acotado por
 * `withBusinessUnitScope`, ya valida implícitamente que el padre pertenece
 * al scope del actor — un `employeeId`/`positionId` ajeno no resuelve).
 *
 * Lanza si el padre no existe o no resuelve en scope, en vez de dejar que
 * el INSERT falle silenciosamente por la restricción NOT NULL o, peor,
 * persista con una unidad de negocio incorrecta.
 */
export async function resolveParentBusinessUnitId(
  fetchParent: () => Promise<{ businessUnitId: number } | null>,
  parentLabel: string
): Promise<number> {
  const parent = await fetchParent()
  if (!parent) {
    throw new Error(
      `No se pudo resolver la unidad de negocio: ${parentLabel} no existe o no está en tu alcance`
    )
  }
  return parent.businessUnitId
}
