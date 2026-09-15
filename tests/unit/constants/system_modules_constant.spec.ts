import { test } from '@japa/runner'
import {
  SYSTEM_MODULES,
  SYSTEM_MODULE_ACTION_CATALOGS,
} from '#constants/system_modules_menu/system_modules.constant'
import { validateSystemModulesDeclaration } from '#constants/system_permission_catalog'
import type { PermissionGateOptions } from '#constants/permission_gate'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import { CALENDAR_PERMISSION_DECLARATIONS } from '#constants/calendar_permission_declarations'
import { EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS } from '#constants/employees_download_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import {
  NOTICES_READ_PERMISSION_DECLARATIONS,
  NOTICES_WRITE_PERMISSION_DECLARATIONS,
} from '#constants/notices_permission_declarations'
import {
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
} from '#constants/positions_permission_declarations'
import { USERS_PERMISSION_DECLARATIONS } from '#constants/users_permission_declarations'

/**
 * Rutas del backoffice que no coinciden con el slug por un alias declarado en
 * el propio BO (`components/asideMenu/domain/menu.const.ts`,
 * `ROUTE_MODULE_SLUG_ALIASES`). Cualquier otra diferencia es un 403 para todo
 * rol que no sea root u owner.
 */
const BO_ROUTE_ALIASES: Record<string, string> = {
  'repse-registrations': '/repse',
}

/** Declaraciones que consumen las rutas con `middleware.permissionGate`. */
const GATE_DECLARATIONS: object[] = [
  ACCESS_POINT_PERMISSION_DECLARATIONS,
  CALENDAR_PERMISSION_DECLARATIONS,
  EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS,
  EMPLOYEES_READ_PERMISSION_DECLARATIONS,
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  NOTICES_READ_PERMISSION_DECLARATIONS,
  NOTICES_WRITE_PERMISSION_DECLARATIONS,
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
  USERS_PERMISSION_DECLARATIONS,
]

const collectGateOptions = (value: unknown): PermissionGateOptions[] => {
  if (!value || typeof value !== 'object') {
    return []
  }
  if ('module' in value && 'action' in value) {
    return [value as PermissionGateOptions]
  }
  return Object.values(value).flatMap(collectGateOptions)
}

test.group('system_modules.constant — contrato del catálogo', () => {
  test('la declaración pasa validateSystemModulesDeclaration: sin claves de grupo, slugs de módulo ni permisos repetidos, y todo grupo referido existe', ({
    assert,
  }) => {
    // Es la misma validación que corre 0062 antes de sembrar: los casos de
    // cada regla se prueban en system_permission_catalog.spec.ts.
    assert.doesNotThrow(() => validateSystemModulesDeclaration())
  })

  test('la ruta navegable coincide con el slug, que es como el BO protege la pantalla', ({
    assert,
  }) => {
    const mismatches = SYSTEM_MODULES.filter(
      (systemModule) =>
        !systemModule.systemModuleRetired && !systemModule.systemModulePath.includes('#')
    )
      .filter(
        (systemModule) =>
          systemModule.systemModulePath !==
          (BO_ROUTE_ALIASES[systemModule.systemModuleSlug] ?? `/${systemModule.systemModuleSlug}`)
      )
      .map((systemModule) => `${systemModule.systemModuleSlug} -> ${systemModule.systemModulePath}`)

    assert.deepEqual(mismatches, [])
  })

  test('un módulo retirado queda inactivo y sin permisos', ({ assert }) => {
    const inconsistent = SYSTEM_MODULES.filter(
      (systemModule) =>
        systemModule.systemModuleRetired &&
        (systemModule.systemModuleActive !== 0 || systemModule.systemModulePermissions.length > 0)
    ).map((systemModule) => systemModule.systemModuleSlug)

    assert.deepEqual(inconsistent, [])
  })

  test('todo permiso tiene nombre con contexto, no un verbo suelto', ({ assert }) => {
    // "Eliminar" a secas no dice qué se elimina ni en la pantalla de roles ni
    // al leer `system_permissions` directo en la base de datos.
    const bareNames = SYSTEM_MODULES.flatMap((systemModule) =>
      systemModule.systemModulePermissions
        .filter((permission) => permission.systemPermissionName.trim().split(/\s+/).length < 2)
        .map(
          (permission) =>
            `${systemModule.systemModuleSlug}:${permission.systemPermissionSlug} (${permission.systemPermissionName})`
        )
    )

    assert.deepEqual(bareNames, [])
  })

  test('toda declaración del gate apunta a un módulo con exigencia encendida y a un permiso declarado', ({
    assert,
  }) => {
    // Con la exigencia apagada, `permissionGate` deja pasar a cualquier usuario
    // autenticado: la ruta queda abierta aunque tenga su declaración.
    const modulesBySlug = new Map(
      SYSTEM_MODULES.map((systemModule) => [systemModule.systemModuleSlug as string, systemModule])
    )

    const problems = GATE_DECLARATIONS.flatMap(collectGateOptions).flatMap((options) => {
      const systemModule = modulesBySlug.get(options.module)
      if (!systemModule) {
        return [`${options.module}: módulo inexistente en la constante`]
      }
      if (!systemModule.systemModulePermissionEnforcementActive) {
        return [`${options.module}: exigencia apagada`]
      }

      const declared = new Set<string>(
        systemModule.systemModulePermissions.map((permission) => permission.systemPermissionSlug)
      )
      const actions = typeof options.action === 'string' ? [options.action] : options.action

      return actions
        .filter((action) => !declared.has(action))
        .map((action) => `${options.module}:${action}: permiso no declarado`)
    })

    assert.deepEqual([...new Set(problems)], [])
  })

  test('las acciones con exemption de los catálogos tipados no se siembran como permiso', ({
    assert,
  }) => {
    // Las acciones exentas (p. ej. `collaborator-*`) son apartados documentales
    // de la app del colaborador: si llegaran a `system_permissions`, la pantalla
    // de roles ofrecería casillas que ninguna operación consulta.
    const catalogs: Record<string, readonly ActionCatalogEntry<string>[]> =
      SYSTEM_MODULE_ACTION_CATALOGS
    const modulesBySlug = new Map(
      SYSTEM_MODULES.map((systemModule) => [systemModule.systemModuleSlug as string, systemModule])
    )

    const exempt = Object.entries(catalogs).flatMap(([moduleSlug, actions]) =>
      actions.filter((action) => action.exemption).map((action) => ({ moduleSlug, slug: action.slug }))
    )
    const seeded = exempt
      .filter(({ moduleSlug, slug }) =>
        (modulesBySlug.get(moduleSlug)?.systemModulePermissions ?? []).some(
          (permission) => permission.systemPermissionSlug === slug
        )
      )
      .map(({ moduleSlug, slug }) => `${moduleSlug}:${slug}`)

    assert.isAbove(exempt.length, 0, 'sin acciones exentas el caso no prueba nada')
    assert.deepEqual(seeded, [])
  })
})
