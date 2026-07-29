import type {
  RegulationClauseRow,
  RegulationClauseTreeNodeRaw,
} from './dto/regulatory_framework.dto.js'

/**
 * Helper puro: arma el árbol de numerales de una norma a partir de la lista
 * plana de cláusulas (una sola query, sin preload recursivo → sin N+1).
 *
 * Agrupa por `parentId` y ordena cada grupo de hermanos por `ord` de forma
 * explícita (el `ord` de la semilla es por-grupo, no global: `5.1.1` y
 * `8.1.1` pueden compartir `ord = 1`), así el resultado es correcto sin
 * depender del orden en que llegaron las filas de la consulta.
 *
 * @param clauses Todas las cláusulas de una norma (planas, sin anidar).
 * @returns Las raíces del árbol (`parentId === null`), con `children`
 *   anidados recursivamente en el orden oficial de la norma.
 */
export function buildClauseTree(clauses: RegulationClauseRow[]): RegulationClauseTreeNodeRaw[] {
  const childrenByParent = new Map<number | null, RegulationClauseRow[]>()

  for (const clause of clauses) {
    const key = clause.parentId
    const siblings = childrenByParent.get(key)
    if (siblings) {
      siblings.push(clause)
    } else {
      childrenByParent.set(key, [clause])
    }
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.ord - b.ord)
  }

  function attach(parentId: number | null): RegulationClauseTreeNodeRaw[] {
    const siblings = childrenByParent.get(parentId) ?? []
    return siblings.map((clause) => ({
      id: clause.id,
      code: clause.code,
      ord: clause.ord,
      parentId: clause.parentId,
      titleKey: clause.titleKey,
      obligationKey: clause.obligationKey,
      explanationKey: clause.explanationKey,
      rationaleKey: clause.rationaleKey,
      auditCriteriaKey: clause.auditCriteriaKey,
      applicabilityKey: clause.applicabilityKey,
      children: attach(clause.id),
    }))
  }

  return attach(null)
}

/**
 * Cuenta el total de nodos de un árbol ya construido (raíces + descendientes).
 * Utilidad para verificación manual/tests (p. ej. "47 nodos en total").
 */
export function countTreeNodes(nodes: RegulationClauseTreeNodeRaw[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1 + countTreeNodes(node.children)
  }
  return count
}
