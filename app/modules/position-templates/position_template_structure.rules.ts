import type { PositionTemplateOrgStructure } from '#modules/position-templates/dto/position_template.dto'

/**
 * Reglas de jerarquía de una estructura plantilla (VLRH-H1792205820286, regla 6):
 * claves únicas, `reporta_a` resoluble, exactamente un puesto en la cima y sin ciclos.
 *
 * Módulo puro: no importa BD, modelos, repositorios ni el service. El service traduce
 * cada `OrgStructureIssue` a su hallazgo con `subject` y `detail`.
 */

/** Puesto de la estructura aplanado, con su ruta relativa a la estructura: `areas.<a>.puestos.<p>`. */
export interface OrgStructureNodeRef {
  clave: string
  puesto: string
  reportaA?: string
  path: string
}

/** `path` es la ruta del dato exacto, relativa a la estructura. */
export type OrgStructureIssue =
  | { kind: 'clave_duplicada'; path: string; clave: string }
  | { kind: 'reporta_a_inexistente'; path: string; clave: string; reportaA: string }
  | { kind: 'raiz_invalida'; roots: string[] }
  | { kind: 'ciclo'; path: string; chain: string[] }

export function flattenOrgStructureNodes(
  structure: PositionTemplateOrgStructure
): OrgStructureNodeRef[] {
  return structure.areas.flatMap((area, areaIndex) =>
    area.puestos.map((node, nodeIndex) => ({
      clave: node.clave,
      puesto: node.puesto,
      reportaA: node.reporta_a,
      path: `areas.${areaIndex}.puestos.${nodeIndex}`,
    }))
  )
}

/** Áreas con `codigo` repetido y puestos con `clave` repetida, desde la segunda aparición. */
export function findDuplicateKeys(structure: PositionTemplateOrgStructure): OrgStructureIssue[] {
  const issues: OrgStructureIssue[] = []
  const areaCodes = new Set<string>()
  structure.areas.forEach((area, areaIndex) => {
    if (areaCodes.has(area.codigo)) {
      issues.push({ kind: 'clave_duplicada', path: `areas.${areaIndex}.codigo`, clave: area.codigo })
    }
    areaCodes.add(area.codigo)
  })

  const nodeKeys = new Set<string>()
  for (const node of flattenOrgStructureNodes(structure)) {
    if (nodeKeys.has(node.clave)) {
      issues.push({ kind: 'clave_duplicada', path: `${node.path}.clave`, clave: node.clave })
    }
    nodeKeys.add(node.clave)
  }
  return issues
}

/**
 * `reporta_a` inexistente, cima distinta de una y ciclos. El puesto con clave repetida
 * (ya reportado por `findDuplicateKeys`) no entra a la jerarquía. Iterativo y lineal: una
 * cadena larga no desborda la pila. Cada ciclo se reporta una vez, en su puesto que
 * aparece primero, con `chain` en orden de `reporta_a`.
 */
export function findHierarchyIssues(nodes: OrgStructureNodeRef[]): OrgStructureIssue[] {
  const byKey = new Map<string, OrgStructureNodeRef>()
  const position = new Map<string, number>()
  for (const node of nodes) {
    if (byKey.has(node.clave)) continue
    position.set(node.clave, byKey.size)
    byKey.set(node.clave, node)
  }
  const unique = [...byKey.values()]

  const issues: OrgStructureIssue[] = []
  for (const node of unique) {
    if (node.reportaA !== undefined && !byKey.has(node.reportaA)) {
      issues.push({
        kind: 'reporta_a_inexistente',
        path: `${node.path}.reporta_a`,
        clave: node.clave,
        reportaA: node.reportaA,
      })
    }
  }

  const roots = unique.filter((node) => node.reportaA === undefined).map((node) => node.clave)
  if (roots.length !== 1) issues.push({ kind: 'raiz_invalida', roots })

  const state = new Map<string, 'en_cadena' | 'terminado'>()
  for (const start of unique) {
    if (state.has(start.clave)) continue
    const chain: string[] = []
    let current: string | undefined = start.clave
    while (current !== undefined && !state.has(current)) {
      state.set(current, 'en_cadena')
      chain.push(current)
      const parent: string | undefined = byKey.get(current)?.reportaA
      current = parent !== undefined && byKey.has(parent) ? parent : undefined
    }
    if (current !== undefined && state.get(current) === 'en_cadena') {
      issues.push(cycleIssue(chain.slice(chain.indexOf(current)), byKey, position))
    }
    for (const key of chain) state.set(key, 'terminado')
  }
  return issues
}

/** Gira el ciclo para que empiece en el puesto que aparece primero en el documento. */
function cycleIssue(
  cycle: string[],
  byKey: Map<string, OrgStructureNodeRef>,
  position: Map<string, number>
): OrgStructureIssue {
  let first = 0
  cycle.forEach((key, index) => {
    if ((position.get(key) ?? 0) < (position.get(cycle[first]) ?? 0)) first = index
  })
  const chain = [...cycle.slice(first), ...cycle.slice(0, first)]
  return { kind: 'ciclo', path: `${byKey.get(chain[0])?.path}.reporta_a`, chain }
}

/** Etiqueta de la estructura para el `detail`: `restaurantes 1-10`. */
export function orgStructureLabel(
  structure: Pick<PositionTemplateOrgStructure, 'giro' | 'rango_empleados'>
): string {
  return `${structure.giro} ${structure.rango_empleados}`
}
