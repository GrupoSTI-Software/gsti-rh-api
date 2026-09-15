import SystemModule from '#models/system_module'
import SystemModuleGroup from '#models/system_module_group'
import SystemPermission from '#models/system_permission'
import {
  SYSTEM_CATALOG_DECLARATION,
  validateSystemModulesDeclaration,
  type SystemCatalogDeclaration,
} from '#constants/system_permission_catalog'
import type { FlatSystemModuleDeclaration } from '#constants/system_modules_menu/system_modules.constant'
import {
  buildSystemModuleGroupSeedValues,
  buildSystemModuleSeedValues,
  type SystemModuleSeedValues,
} from '#helpers/system_catalog_seed_resolver'

/**
 * Claves de hallazgo (G = grupos, M = módulos, P = permisos) y si correr la
 * siembra (0061/0062) lo corrige. `false` significa que la siembra no puede:
 * no revive bajas lógicas ni retira lo que la constante no declara, así que
 * hace falta una decisión.
 */
export const SYSTEM_CATALOG_FINDING_FIXABLE_BY_SEED = {
  /** Grupo declarado sin ninguna fila. */
  G1: true,
  /** Grupo declarado cuya fila está dada de baja. */
  G2: false,
  /** Grupo vivo que la constante no declara. */
  G3: false,
  /** Grupo con nombre, orden o icono distinto. */
  G4: true,
  /** Módulo vigente sin ninguna fila. */
  M1: true,
  /** Módulo vigente cuya fila está dada de baja. */
  M2: false,
  /** Módulo retirado en la constante que sigue vivo. */
  M3: true,
  /** Módulo vivo que la constante no declara. */
  M4: false,
  /** Módulo vigente con algún campo distinto. */
  M5: true,
  /** Permiso declarado de un módulo vivo, sin fila. */
  P1: true,
  /** Permiso declarado cuya fila está dada de baja. */
  P2: false,
  /** Permiso vivo de un módulo vigente que la constante no declara. */
  P3: false,
  /** Permiso con nombre distinto. */
  P4: true,
} as const satisfies Record<string, boolean>

export type SystemCatalogFindingCode = keyof typeof SYSTEM_CATALOG_FINDING_FIXABLE_BY_SEED

export interface SystemCatalogFinding {
  code: SystemCatalogFindingCode
  /** `true` si correr 0061/0062 lo corrige; `false` si requiere decisión. */
  fixableBySeed: boolean
  /** Qué se reporta: `grupo "empresa"`, `módulo "employees"`, `permiso "employees:read"`. */
  subject: string
  detail: string
}

export type SystemModuleGroupCatalogRow = Pick<
  SystemModuleGroup,
  | 'systemModuleGroupId'
  | 'systemModuleGroupKey'
  | 'systemModuleGroupName'
  | 'systemModuleGroupOrder'
  | 'systemModuleGroupIcon'
  | 'deletedAt'
>

export type SystemModuleCatalogRow = Pick<
  SystemModule,
  'systemModuleId' | keyof SystemModuleSeedValues | 'deletedAt'
>

export type SystemPermissionCatalogRow = Pick<
  SystemPermission,
  'systemPermissionId' | 'systemModuleId' | 'systemPermissionSlug' | 'systemPermissionName' | 'deletedAt'
>

/** Filas de BD a comparar, incluidas las dadas de baja. */
export interface SystemCatalogRows {
  groups: readonly SystemModuleGroupCatalogRow[]
  modules: readonly SystemModuleCatalogRow[]
  permissions: readonly SystemPermissionCatalogRow[]
}

type ModuleComparedField = Exclude<keyof SystemModuleSeedValues, 'systemModuleSlug'>

/** Etiqueta de cada campo que 0062 escribe en un módulo. El slug es la identidad: no se compara. */
const MODULE_FIELD_LABELS: Readonly<Record<ModuleComparedField, string>> = {
  systemModuleName: 'nombre',
  systemModuleDescription: 'descripción',
  systemModules: 'systemModules',
  systemModulePath: 'ruta',
  systemModuleActive: 'activo',
  systemModuleOrder: 'orden',
  systemModuleGroupId: 'grupo',
  systemModulePermissionEnforcementActive: 'exigencia de permisos',
  systemModuleIcon: 'icono',
}

const MODULE_COMPARED_FIELDS = Object.keys(MODULE_FIELD_LABELS) as ModuleComparedField[]

function finding(
  code: SystemCatalogFindingCode,
  subject: string,
  detail: string
): SystemCatalogFinding {
  return { code, fixableBySeed: SYSTEM_CATALOG_FINDING_FIXABLE_BY_SEED[code], subject, detail }
}

/**
 * Compara como texto: MySQL devuelve `system_modules` (tinyint) como número y
 * la siembra lo escribe como texto; el valor guardado es el mismo y no debe
 * reportarse como diferencia.
 */
function differs(current: unknown, expected: unknown): boolean {
  return String(current) !== String(expected)
}

function valueChange(label: string, current: unknown, expected: unknown): string {
  return `${label}: BD ${JSON.stringify(current)} → constante ${JSON.stringify(expected)}`
}

/**
 * Indexa filas por su clave natural. El índice único solo cubre filas vivas,
 * así que puede haber una viva y varias dadas de baja con la misma clave: gana
 * la viva, que es la que usa el sistema.
 */
function indexPreferringLive<TRow extends { deletedAt: unknown }>(
  rows: readonly TRow[],
  keyOf: (row: TRow) => string
): Map<string, TRow> {
  const index = new Map<string, TRow>()
  for (const row of rows) {
    const current = index.get(keyOf(row))
    if (!current || (current.deletedAt && !row.deletedAt)) {
      index.set(keyOf(row), row)
    }
  }
  return index
}

function diffGroups(
  declaration: SystemCatalogDeclaration,
  groupRows: readonly SystemModuleGroupCatalogRow[]
): SystemCatalogFinding[] {
  const findings: SystemCatalogFinding[] = []
  const rowByKey = indexPreferringLive(groupRows, (row) => row.systemModuleGroupKey)

  for (const group of declaration.groups) {
    const subject = `grupo "${group.key}"`
    const row = rowByKey.get(group.key)

    if (!row) {
      findings.push(finding('G1', subject, 'declarado en la constante, sin fila en system_module_groups'))
      continue
    }
    if (row.deletedAt) {
      findings.push(
        finding('G2', subject, 'declarado en la constante, pero su fila está dada de baja y la siembra no la revive')
      )
      continue
    }

    const expected = buildSystemModuleGroupSeedValues(group)
    const changes: string[] = []
    if (differs(row.systemModuleGroupName, expected.systemModuleGroupName)) {
      changes.push(valueChange('nombre', row.systemModuleGroupName, expected.systemModuleGroupName))
    }
    if (differs(row.systemModuleGroupOrder, expected.systemModuleGroupOrder)) {
      changes.push(valueChange('orden', row.systemModuleGroupOrder, expected.systemModuleGroupOrder))
    }
    if (differs(row.systemModuleGroupIcon, expected.systemModuleGroupIcon)) {
      // El SVG no cabe en una línea de consola: basta con saber que cambió.
      changes.push('icono distinto')
    }
    if (changes.length > 0) {
      findings.push(finding('G4', subject, `campos distintos: ${changes.join('; ')}`))
    }
  }

  const declaredKeys = new Set(declaration.groups.map((group) => group.key))
  for (const row of groupRows) {
    if (!row.deletedAt && !declaredKeys.has(row.systemModuleGroupKey)) {
      findings.push(
        finding(
          'G3',
          `grupo "${row.systemModuleGroupKey}"`,
          `fila viva (id ${row.systemModuleGroupId}) que la constante no declara`
        )
      )
    }
  }

  return findings
}

function groupKeyLabel(groupId: number | null, groupKeyById: ReadonlyMap<number, string>): string {
  if (groupId === null) {
    return 'sin grupo'
  }
  return groupKeyById.get(groupId) ?? `id ${groupId}`
}

/**
 * El grupo solo se compara si la clave declarada resuelve a un grupo vivo. Si
 * no, G1/G2 ya lo reportan y 0062 lanzaría antes de escribir el módulo.
 */
function isGroupResolvable(
  systemModule: FlatSystemModuleDeclaration,
  liveGroupIdByKey: ReadonlyMap<string, number>
): boolean {
  return (
    systemModule.systemModuleGroupKey === null ||
    liveGroupIdByKey.has(systemModule.systemModuleGroupKey)
  )
}

function describeModuleChange(
  field: ModuleComparedField,
  row: SystemModuleCatalogRow,
  expected: SystemModuleSeedValues,
  groupKeyById: ReadonlyMap<number, string>
): string {
  const label = MODULE_FIELD_LABELS[field]
  if (field === 'systemModuleIcon') {
    return `${label} distinto`
  }
  if (field === 'systemModuleGroupId') {
    // Por clave y no por id: el id cambia entre entornos, la clave no.
    return valueChange(
      label,
      groupKeyLabel(row.systemModuleGroupId, groupKeyById),
      groupKeyLabel(expected.systemModuleGroupId, groupKeyById)
    )
  }
  return valueChange(label, row[field], expected[field])
}

function diffModules(
  declaration: SystemCatalogDeclaration,
  rows: SystemCatalogRows
): SystemCatalogFinding[] {
  const findings: SystemCatalogFinding[] = []
  // Igual que 0062: el id de grupo sale solo de grupos vivos.
  const liveGroupIdByKey = new Map(
    rows.groups
      .filter((row) => !row.deletedAt)
      .map((row) => [row.systemModuleGroupKey, row.systemModuleGroupId])
  )
  const groupKeyById = new Map(
    rows.groups.map((row) => [row.systemModuleGroupId, row.systemModuleGroupKey])
  )
  const rowBySlug = indexPreferringLive(rows.modules, (row) => row.systemModuleSlug)

  for (const systemModule of declaration.modules) {
    const subject = `módulo "${systemModule.systemModuleSlug}"`
    const row = rowBySlug.get(systemModule.systemModuleSlug)

    if (systemModule.systemModuleRetired) {
      // Un retirado sin fila, o ya dado de baja, no expone pantalla ni permisos.
      if (row && !row.deletedAt) {
        findings.push(finding('M3', subject, 'retirado en la constante, pero su fila sigue viva'))
      }
      continue
    }
    if (!row) {
      findings.push(finding('M1', subject, 'vigente en la constante, sin fila en system_modules'))
      continue
    }
    if (row.deletedAt) {
      findings.push(
        finding('M2', subject, 'vigente en la constante, pero su fila está dada de baja y la siembra no la revive')
      )
      continue
    }

    const expected = buildSystemModuleSeedValues(systemModule, liveGroupIdByKey)
    const changes = MODULE_COMPARED_FIELDS.filter((field) => differs(row[field], expected[field]))
      .filter(
        (field) =>
          field !== 'systemModuleGroupId' || isGroupResolvable(systemModule, liveGroupIdByKey)
      )
      .map((field) => describeModuleChange(field, row, expected, groupKeyById))

    if (changes.length > 0) {
      findings.push(finding('M5', subject, `campos distintos: ${changes.join('; ')}`))
    }
  }

  const declaredSlugs = new Set(declaration.modules.map((systemModule) => systemModule.systemModuleSlug))
  for (const row of rows.modules) {
    if (!row.deletedAt && !declaredSlugs.has(row.systemModuleSlug)) {
      findings.push(
        finding(
          'M4',
          `módulo "${row.systemModuleSlug}"`,
          `fila viva (id ${row.systemModuleId}) que la constante no declara`
        )
      )
    }
  }

  return findings
}

/**
 * Solo recorre módulos vigentes con fila viva: si el módulo falta o está dado
 * de baja ya lo reporta M1/M2, y los permisos que cuelgan de un módulo
 * retirado quedan fuera a propósito (el retiro solo da de baja el módulo).
 */
function diffPermissions(
  declaration: SystemCatalogDeclaration,
  rows: SystemCatalogRows
): SystemCatalogFinding[] {
  const findings: SystemCatalogFinding[] = []
  const liveModuleBySlug = new Map(
    rows.modules.filter((row) => !row.deletedAt).map((row) => [row.systemModuleSlug, row])
  )
  const permissionByKey = indexPreferringLive(
    rows.permissions,
    (row) => `${row.systemModuleId}:${row.systemPermissionSlug}`
  )
  const livePermissionsByModuleId = new Map<number, SystemPermissionCatalogRow[]>()
  for (const row of rows.permissions) {
    if (row.deletedAt) {
      continue
    }
    const modulePermissions = livePermissionsByModuleId.get(row.systemModuleId) ?? []
    modulePermissions.push(row)
    livePermissionsByModuleId.set(row.systemModuleId, modulePermissions)
  }

  for (const systemModule of declaration.modules) {
    const moduleRow = liveModuleBySlug.get(systemModule.systemModuleSlug)
    if (systemModule.systemModuleRetired || !moduleRow) {
      continue
    }

    const declaredSlugs = new Set<string>()
    for (const permission of systemModule.systemModulePermissions) {
      declaredSlugs.add(permission.systemPermissionSlug)
      const subject = `permiso "${systemModule.systemModuleSlug}:${permission.systemPermissionSlug}"`
      const row = permissionByKey.get(`${moduleRow.systemModuleId}:${permission.systemPermissionSlug}`)

      if (!row) {
        findings.push(finding('P1', subject, 'declarado en la constante, sin fila en system_permissions'))
      } else if (row.deletedAt) {
        findings.push(
          finding('P2', subject, 'declarado en la constante, pero su fila está dada de baja y la siembra no la revive')
        )
      } else if (differs(row.systemPermissionName, permission.systemPermissionName)) {
        findings.push(
          finding('P4', subject, valueChange('nombre', row.systemPermissionName, permission.systemPermissionName))
        )
      }
    }

    for (const row of livePermissionsByModuleId.get(moduleRow.systemModuleId) ?? []) {
      if (!declaredSlugs.has(row.systemPermissionSlug)) {
        findings.push(
          finding(
            'P3',
            `permiso "${systemModule.systemModuleSlug}:${row.systemPermissionSlug}"`,
            `fila viva (id ${row.systemPermissionId}) que la constante no declara`
          )
        )
      }
    }
  }

  return findings
}

/**
 * Compara la declaración contra las filas de BD. Función pura: no consulta ni
 * escribe nada, por eso se prueba sin BD.
 *
 * Reporta todo lo que la siembra cambiaría si corriera (usa las mismas
 * funciones de valores que 0061/0062) y lo que la siembra no puede arreglar.
 * Fuera de alcance a propósito: permisos vivos de módulos retirados y
 * concesiones en `role_system_permissions` (las maneja 0063).
 */
export function diffSystemCatalog(
  declaration: SystemCatalogDeclaration,
  rows: SystemCatalogRows
): SystemCatalogFinding[] {
  return [
    ...diffGroups(declaration, rows.groups),
    ...diffModules(declaration, rows),
    ...diffPermissions(declaration, rows),
  ]
}

/**
 * Revisión de consistencia de solo lectura: compara `system_modules.constant.ts`
 * contra grupos, módulos y permisos en BD. Nunca corrige, crea ni borra.
 */
export default class SystemCatalogConsistencyService {
  /**
   * Valida la declaración y la compara contra la BD con tres consultas
   * `withTrashed()`: una baja lógica es un hallazgo distinto a una fila que no
   * existe.
   */
  async check(): Promise<SystemCatalogFinding[]> {
    validateSystemModulesDeclaration(SYSTEM_CATALOG_DECLARATION)

    const [groups, modules, permissions] = await Promise.all([
      SystemModuleGroup.query().withTrashed().orderBy('system_module_group_id'),
      SystemModule.query().withTrashed().orderBy('system_module_id'),
      SystemPermission.query().withTrashed().orderBy('system_permission_id'),
    ])

    return diffSystemCatalog(SYSTEM_CATALOG_DECLARATION, { groups, modules, permissions })
  }
}
