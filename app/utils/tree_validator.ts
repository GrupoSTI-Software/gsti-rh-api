/**
 * Utilidades síncronas para validar enlaces padre ↔ hijo en árboles jerárquicos.
 * Pensado para reuso en departamentos/puestos y tests unitarios con mapas en memoria.
 */

/** Indica si asignar `proposedParentId` como padre de `nodeId` crearía un ciclo ascendente inválido. */
export function wouldCreateHierarchyCycleWithParentMap(opts: {
  nodeId: number
  proposedParentId: number
  /** Para cada ID de nodo conocido devuelve su padre o null si es raíz. */
  parentByNodeId: ReadonlyMap<number, number | null>
}): boolean {
  const { nodeId, proposedParentId, parentByNodeId } = opts
  if (nodeId === proposedParentId) {
    return true
  }

  let cursor: number | null = proposedParentId
  const seen = new Set<number>()

  while (cursor !== null) {
    if (cursor === nodeId) {
      return true
    }
    if (seen.has(cursor)) {
      // Datos corruptos (ciclo ya existente en BD); mejor bloquear el movimiento
      return true
    }
    seen.add(cursor)
    const parent = parentByNodeId.get(cursor)
    if (parent === undefined) {
      break
    }
    cursor = parent
  }
  return false
}

/** Igual que `wouldCreateHierarchyCycleWithParentMap` pero usando callback de navegación. */
export async function wouldCreateHierarchyCycleFetchingParent(opts: {
  nodeId: number
  proposedParentId: number
  fetchParentOf: (id: number) => Promise<number | null>
  /** Límite de saltos ascendente para datos anómalos en cadena. */
  maxHops?: number
}): Promise<boolean> {
  const { nodeId, proposedParentId, fetchParentOf } = opts
  const maxHops = opts.maxHops ?? 10_000

  if (nodeId === proposedParentId) {
    return true
  }

  let cursor: number | null = proposedParentId
  let hops = 0
  const seen = new Set<number>()

  while (cursor !== null && hops < maxHops) {
    if (cursor === nodeId) {
      return true
    }
    if (seen.has(cursor)) {
      return true
    }
    seen.add(cursor)
    const next = await fetchParentOf(cursor)
    cursor = next
    hops += 1
  }

  return hops >= maxHops
}
