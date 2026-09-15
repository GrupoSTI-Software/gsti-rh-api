import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import SystemModule from '#models/system_module'
import SystemModuleGroup from '#models/system_module_group'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import SystemCatalogConsistencyService, {
  diffSystemCatalog,
  type SystemCatalogFindingCode,
  type SystemCatalogRows,
  type SystemModuleCatalogRow,
  type SystemPermissionCatalogRow,
} from '#services/system_catalog_consistency_service'
import type { SystemCatalogDeclaration } from '#constants/system_permission_catalog'
import {
  buildSystemModuleGroupSeedValues,
  buildSystemModuleSeedValues,
} from '#helpers/system_catalog_seed_resolver'

/**
 * `diffSystemCatalog` es pura: se prueba sin BD con una declaración mínima y
 * las filas que la siembra escribiría para ella (mismas funciones de valores
 * que 0061/0062). Cada escenario rompe una sola cosa y espera exactamente un
 * hallazgo, con su clave y con `fixableBySeed` escrito a mano, no leído del
 * servicio.
 */

const ICON = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
const DELETED_AT = DateTime.fromISO('2026-01-01T00:00:00.000Z')

const DECLARATION: SystemCatalogDeclaration = {
  groups: [{ key: 'grupo-prueba', name: 'Grupo de prueba', order: 10, icon: ICON }],
  modules: [
    {
      systemModuleName: 'Módulo de prueba',
      systemModuleSlug: 'modulo-prueba',
      systemModuleDescription: '',
      systemModules: 1,
      systemModulePath: '/modulo-prueba',
      systemModuleOrder: 1,
      systemModuleActive: 1,
      systemModulePermissionEnforcementActive: true,
      systemModuleRetired: false,
      systemModuleIcon: ICON,
      systemModulePermissions: [
        { systemPermissionName: 'Acceder al módulo de prueba', systemPermissionSlug: 'read' },
        { systemPermissionName: 'Crear en el módulo de prueba', systemPermissionSlug: 'create' },
      ],
      systemModuleGroupKey: 'grupo-prueba',
    },
    {
      systemModuleName: 'Módulo suelto',
      systemModuleSlug: 'modulo-suelto',
      systemModuleDescription: '',
      systemModules: 1,
      systemModulePath: '/modulo-suelto',
      systemModuleOrder: 2,
      systemModuleActive: 1,
      systemModulePermissionEnforcementActive: false,
      systemModuleRetired: false,
      systemModuleIcon: ICON,
      systemModulePermissions: [
        { systemPermissionName: 'Acceder al módulo suelto', systemPermissionSlug: 'read' },
      ],
      systemModuleGroupKey: null,
    },
    {
      systemModuleName: 'Módulo retirado',
      systemModuleSlug: 'modulo-retirado',
      systemModuleDescription: '',
      systemModules: 1,
      systemModulePath: '/modulo-retirado',
      systemModuleOrder: 0,
      systemModuleActive: 0,
      systemModulePermissionEnforcementActive: false,
      systemModuleRetired: true,
      systemModuleIcon: ICON,
      systemModulePermissions: [],
      systemModuleGroupKey: 'grupo-prueba',
    },
  ],
}

/** Filas que deja la siembra sobre una BD vacía: ids en orden de declaración, retirados dados de baja. */
function seededRows(): SystemCatalogRows {
  const groups = DECLARATION.groups.map((group, index) => ({
    systemModuleGroupId: index + 1,
    ...buildSystemModuleGroupSeedValues(group),
    deletedAt: null,
  }))
  const groupIdByKey = new Map(groups.map((row) => [row.systemModuleGroupKey, row.systemModuleGroupId]))
  const modules = DECLARATION.modules.map((systemModule, index) => ({
    systemModuleId: index + 1,
    ...buildSystemModuleSeedValues(systemModule, groupIdByKey),
    deletedAt: systemModule.systemModuleRetired ? DELETED_AT : null,
  }))
  let nextPermissionId = 1
  const permissions = DECLARATION.modules.flatMap((systemModule, index) =>
    systemModule.systemModulePermissions.map((permission) => ({
      systemPermissionId: nextPermissionId++,
      systemModuleId: index + 1,
      ...permission,
      deletedAt: null,
    }))
  )
  return { groups, modules, permissions }
}

function withModule(
  rows: SystemCatalogRows,
  slug: string,
  patch: Partial<SystemModuleCatalogRow>
): SystemCatalogRows {
  return {
    ...rows,
    modules: rows.modules.map((row) => (row.systemModuleSlug === slug ? { ...row, ...patch } : row)),
  }
}

function withPermission(
  rows: SystemCatalogRows,
  systemPermissionId: number,
  patch: Partial<SystemPermissionCatalogRow>
): SystemCatalogRows {
  return {
    ...rows,
    permissions: rows.permissions.map((row) =>
      row.systemPermissionId === systemPermissionId ? { ...row, ...patch } : row
    ),
  }
}

function moduleRow(rows: SystemCatalogRows, slug: string): SystemModuleCatalogRow {
  const row = rows.modules.find((candidate) => candidate.systemModuleSlug === slug)
  if (!row) {
    throw new Error(`La fila del módulo "${slug}" debería existir en las filas sembradas.`)
  }
  return row
}

interface Scenario {
  title: string
  code: SystemCatalogFindingCode
  fixableBySeed: boolean
  subject: string
  breakRows: (rows: SystemCatalogRows) => SystemCatalogRows
}

// Ids de las filas sembradas: grupo-prueba = 1; modulo-prueba = 1, modulo-suelto = 2,
// modulo-retirado = 3; permisos modulo-prueba:read = 1, modulo-prueba:create = 2.
const SCENARIOS: Scenario[] = [
  {
    title: 'grupo declarado sin fila',
    code: 'G1',
    fixableBySeed: true,
    subject: 'grupo "grupo-prueba"',
    breakRows: (rows) => ({ ...rows, groups: [] }),
  },
  {
    title: 'grupo declarado dado de baja',
    code: 'G2',
    fixableBySeed: false,
    subject: 'grupo "grupo-prueba"',
    breakRows: (rows) => ({
      ...rows,
      groups: rows.groups.map((row) => ({ ...row, deletedAt: DELETED_AT })),
    }),
  },
  {
    title: 'grupo vivo no declarado',
    code: 'G3',
    fixableBySeed: false,
    subject: 'grupo "grupo-huerfano"',
    breakRows: (rows) => ({
      ...rows,
      groups: [
        ...rows.groups,
        {
          systemModuleGroupId: 2,
          systemModuleGroupKey: 'grupo-huerfano',
          systemModuleGroupName: 'Grupo huérfano',
          systemModuleGroupOrder: 99,
          systemModuleGroupIcon: null,
          deletedAt: null,
        },
      ],
    }),
  },
  {
    title: 'grupo con nombre distinto',
    code: 'G4',
    fixableBySeed: true,
    subject: 'grupo "grupo-prueba"',
    breakRows: (rows) => ({
      ...rows,
      groups: rows.groups.map((row) => ({ ...row, systemModuleGroupName: 'Nombre viejo' })),
    }),
  },
  {
    title: 'módulo vigente sin fila',
    code: 'M1',
    fixableBySeed: true,
    subject: 'módulo "modulo-prueba"',
    breakRows: (rows) => ({
      ...rows,
      modules: rows.modules.filter((row) => row.systemModuleSlug !== 'modulo-prueba'),
    }),
  },
  {
    title: 'módulo vigente dado de baja',
    code: 'M2',
    fixableBySeed: false,
    subject: 'módulo "modulo-prueba"',
    breakRows: (rows) => withModule(rows, 'modulo-prueba', { deletedAt: DELETED_AT }),
  },
  {
    title: 'módulo retirado que sigue vivo',
    code: 'M3',
    fixableBySeed: true,
    subject: 'módulo "modulo-retirado"',
    breakRows: (rows) => withModule(rows, 'modulo-retirado', { deletedAt: null }),
  },
  {
    title: 'módulo vivo no declarado',
    code: 'M4',
    fixableBySeed: false,
    subject: 'módulo "modulo-huerfano"',
    breakRows: (rows) => ({
      ...rows,
      modules: [
        ...rows.modules,
        {
          ...moduleRow(rows, 'modulo-suelto'),
          systemModuleId: 99,
          systemModuleSlug: 'modulo-huerfano',
        },
      ],
    }),
  },
  {
    title: 'módulo vigente con un campo distinto',
    code: 'M5',
    fixableBySeed: true,
    subject: 'módulo "modulo-prueba"',
    breakRows: (rows) => withModule(rows, 'modulo-prueba', { systemModulePath: '/ruta-vieja' }),
  },
  {
    title: 'permiso declarado sin fila',
    code: 'P1',
    fixableBySeed: true,
    subject: 'permiso "modulo-prueba:create"',
    breakRows: (rows) => ({
      ...rows,
      permissions: rows.permissions.filter((row) => row.systemPermissionId !== 2),
    }),
  },
  {
    title: 'permiso declarado dado de baja',
    code: 'P2',
    fixableBySeed: false,
    subject: 'permiso "modulo-prueba:create"',
    breakRows: (rows) => withPermission(rows, 2, { deletedAt: DELETED_AT }),
  },
  {
    title: 'permiso vivo no declarado',
    code: 'P3',
    fixableBySeed: false,
    subject: 'permiso "modulo-prueba:delete"',
    breakRows: (rows) => ({
      ...rows,
      permissions: [
        ...rows.permissions,
        {
          systemPermissionId: 99,
          systemModuleId: 1,
          systemPermissionSlug: 'delete',
          systemPermissionName: 'Eliminar en el módulo de prueba',
          deletedAt: null,
        },
      ],
    }),
  },
  {
    title: 'permiso con nombre distinto',
    code: 'P4',
    fixableBySeed: true,
    subject: 'permiso "modulo-prueba:read"',
    breakRows: (rows) => withPermission(rows, 1, { systemPermissionName: 'Nombre viejo' }),
  },
]

test.group('diffSystemCatalog — hallazgos G1 a P4 sin BD', () => {
  test('sin hallazgos cuando la BD tiene exactamente lo que escribe la siembra', ({ assert }) => {
    assert.deepEqual(diffSystemCatalog(DECLARATION, seededRows()), [])
  })

  for (const scenario of SCENARIOS) {
    test(`${scenario.code}: ${scenario.title}`, ({ assert }) => {
      const findings = diffSystemCatalog(DECLARATION, scenario.breakRows(seededRows()))

      assert.deepEqual(
        findings.map(({ code, fixableBySeed, subject }) => ({ code, fixableBySeed, subject })),
        [{ code: scenario.code, fixableBySeed: scenario.fixableBySeed, subject: scenario.subject }]
      )
    })
  }

  test('M5 nombra el campo y sus dos valores', ({ assert }) => {
    const [finding] = diffSystemCatalog(
      DECLARATION,
      withModule(seededRows(), 'modulo-prueba', { systemModulePath: '/ruta-vieja' })
    )

    assert.include(finding.detail, 'ruta: BD "/ruta-vieja" → constante "/modulo-prueba"')
  })

  test('el icono distinto se reporta sin volcar el SVG', ({ assert }) => {
    const findings = diffSystemCatalog(
      DECLARATION,
      withModule(seededRows(), 'modulo-prueba', { systemModuleIcon: '<svg/>' })
    )

    assert.lengthOf(findings, 1)
    assert.include(findings[0].detail, 'icono distinto')
    assert.notInclude(findings[0].detail, '<svg')
  })

  test('el grupo distinto se reporta por clave, no por id', ({ assert }) => {
    const rows = seededRows()
    const findings = diffSystemCatalog(DECLARATION, {
      ...withModule(rows, 'modulo-prueba', { systemModuleGroupId: 2 }),
      groups: [
        ...rows.groups,
        {
          systemModuleGroupId: 2,
          systemModuleGroupKey: 'grupo-huerfano',
          systemModuleGroupName: 'Grupo huérfano',
          systemModuleGroupOrder: 99,
          systemModuleGroupIcon: null,
          deletedAt: null,
        },
      ],
    })

    assert.deepEqual(
      findings.map((finding) => finding.code),
      ['G3', 'M5']
    )
    assert.include(findings[1].detail, 'grupo: BD "grupo-huerfano" → constante "grupo-prueba"')
  })

  test('systemModules llega como número desde MySQL (tinyint) y no es hallazgo', ({ assert }) => {
    // El modelo lo tipa como texto, pero el driver entrega el tinyint como número.
    const rows = withModule(seededRows(), 'modulo-prueba', {
      systemModules: 1 as unknown as string,
    })

    assert.deepEqual(diffSystemCatalog(DECLARATION, rows), [])
  })

  test('una fila dada de baja con el mismo slug no oculta a la fila viva', ({ assert }) => {
    const rows = seededRows()
    const trashedCopy = {
      ...moduleRow(rows, 'modulo-prueba'),
      systemModuleId: 50,
      systemModulePath: '/ruta-vieja',
      deletedAt: DELETED_AT,
    }

    assert.deepEqual(
      diffSystemCatalog(DECLARATION, { ...rows, modules: [trashedCopy, ...rows.modules] }),
      []
    )
  })

  test('fuera de alcance: un permiso vivo colgado de un módulo retirado no se reporta', ({
    assert,
  }) => {
    const rows = seededRows()
    const orphanPermission = {
      systemPermissionId: 98,
      systemModuleId: moduleRow(rows, 'modulo-retirado').systemModuleId,
      systemPermissionSlug: 'read',
      systemPermissionName: 'Acceder al módulo retirado',
      deletedAt: null,
    }

    assert.deepEqual(
      diffSystemCatalog(DECLARATION, { ...rows, permissions: [...rows.permissions, orphanPermission] }),
      []
    )
  })
})

test.group('SystemCatalogConsistencyService.check — contra la BD de pruebas', () => {
  test('es de solo lectura: grupos, módulos, permisos y concesiones quedan idénticos', async ({
    assert,
  }) => {
    // Filas completas (bajas incluidas) y no solo conteos: un UPDATE no cambia
    // el conteo, pero sí `updated_at` y los campos.
    const snapshot = async () => {
      const groups = await SystemModuleGroup.query().withTrashed().orderBy('system_module_group_id')
      const modules = await SystemModule.query().withTrashed().orderBy('system_module_id')
      const permissions = await SystemPermission.query()
        .withTrashed()
        .orderBy('system_permission_id')
      const grants = await RoleSystemPermission.query().withTrashed()
      return {
        groups: groups.map((row) => row.serialize()),
        modules: modules.map((row) => row.serialize()),
        permissions: permissions.map((row) => row.serialize()),
        grants: grants.map((row) => row.serialize()),
      }
    }

    const before = await snapshot()
    const findings = await new SystemCatalogConsistencyService().check()
    const after = await snapshot()

    assert.isAbove(before.modules.length, 0, 'la BD de pruebas debe venir sembrada')
    assert.deepEqual(after, before, 'la revisión de consistencia nunca escribe en BD')

    // La BD viene de `migration:fresh --seed`: lo que 0061/0062 crean o renombran
    // desde la constante no puede salir como hallazgo, porque la revisión compara
    // con los mismos valores con los que se sembró. M5 (campos del módulo, bandera
    // de exigencia incluida) y los hallazgos que piden decisión quedan fuera:
    // otros specs de la corrida cambian esas filas o crean fixtures propios.
    const seedCodes: readonly SystemCatalogFindingCode[] = ['G1', 'G4', 'M1', 'M3', 'P1', 'P4']
    assert.deepEqual(
      findings.filter((finding) => seedCodes.includes(finding.code)),
      [],
      'la revisión reporta como pendiente algo que la siembra ya escribió'
    )
  })
})
