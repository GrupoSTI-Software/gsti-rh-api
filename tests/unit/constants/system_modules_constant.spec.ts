import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { test } from '@japa/runner'
import {
  SYSTEM_MODULES,
  SYSTEM_MODULE_ACTION_CATALOGS,
} from '#constants/system_modules_menu/system_modules.constant'
import { validateSystemModulesDeclaration } from '#constants/system_permission_catalog'
import type { PermissionGateOptions } from '#constants/permission_gate'
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/**
 * Rutas del backoffice que no coinciden con el slug por un alias declarado en
 * el propio BO (`components/asideMenu/domain/menu.const.ts`,
 * `ROUTE_MODULE_SLUG_ALIASES`). Cualquier otra diferencia es un 403 para todo
 * rol que no sea root u owner.
 */
const BO_ROUTE_ALIASES: Record<string, string> = {
  'repse-registrations': '/repse',
}

/**
 * Convención de nombre de los archivos que declaran lo que consume
 * `middleware.permissionGate`. El contrato se aplica a todo archivo que la
 * cumpla: una lista escrita a mano dejaba fuera por olvido cualquier
 * declaración nueva, y con ella una ruta que parecía protegida sin estarlo.
 */
const DECLARATIONS_DIR = join(process.cwd(), 'app/constants')
const DECLARATIONS_SUFFIX = '_permission_declarations.ts'

interface DiscoveredDeclarations {
  file: string
  options: PermissionGateOptions[]
}

/**
 * Recorre los exports buscando objetos con forma de declaración del gate.
 * Las funciones (p. ej. `employeesAttendanceReportJobDeclaration`) no se
 * evalúan: devuelven declaraciones que ya viven en un mapa exportado.
 */
const collectGateOptions = (value: unknown): PermissionGateOptions[] => {
  if (!value || typeof value !== 'object') {
    return []
  }
  if ('module' in value && 'action' in value) {
    return [value as PermissionGateOptions]
  }
  return Object.values(value).flatMap(collectGateOptions)
}

/**
 * Importa cada `app/constants/*_permission_declarations.ts` por el alias del
 * repo y junta todas sus declaraciones, sin importar cómo se llame el export.
 */
async function discoverGateDeclarations(): Promise<DiscoveredDeclarations[]> {
  const files = readdirSync(DECLARATIONS_DIR)
    .filter((file) => file.endsWith(DECLARATIONS_SUFFIX))
    .sort()

  return Promise.all(
    files.map(async (file) => {
      const moduleExports: Record<string, unknown> = await import(
        `#constants/${file.slice(0, -'.ts'.length)}`
      )
      return { file, options: Object.values(moduleExports).flatMap(collectGateOptions) }
    })
  )
}

/** Especificador de import que el contrato reconoce como archivo de declaraciones. */
const DECLARATIONS_IMPORT = /^#constants\/[a-z0-9_]+_permission_declarations$/

/**
 * Archivos que montan rutas: todo `start/**` y los `*.routes.ts` de los
 * módulos verticales. Lo retirado a `__TO_DELETE__/` no se registra y no cuenta.
 */
function listRouteSourceFiles(): string[] {
  const walk = (dir: string, accept: (file: string) => boolean): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__TO_DELETE__' || entry.name === 'node_modules') {
        return []
      }
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        return walk(path, accept)
      }
      return accept(entry.name) ? [path] : []
    })

  return [
    ...walk(join(process.cwd(), 'start'), (name) => name.endsWith('.ts')),
    ...walk(join(process.cwd(), 'app/modules'), (name) => name.endsWith('.routes.ts')),
  ].sort()
}

/** Identificador raíz de `A.b`, `A['b']`, `A.b(...)` o `(A.b as X)`; `null` si no hay uno. */
function rootIdentifier(expression: ts.Expression): ts.Identifier | null {
  let current: ts.Expression = expression
  while (!ts.isIdentifier(current)) {
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isCallExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression
      continue
    }
    return null
  }
  return current
}

interface GateCallSite {
  file: string
  line: number
  argument: string
  imported: boolean
}

/**
 * Recorre con el AST de TypeScript cada llamada a `*.permissionGate(...)` y
 * marca si su argumento sale de un import de `#constants/*_permission_declarations`.
 * Un objeto escrito en el archivo de rutas, o una constante local, queda fuera
 * del descubrimiento de arriba y por eso fuera del contrato.
 */
function collectGateCallSites(): GateCallSite[] {
  return listRouteSourceFiles().flatMap((path) => {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    const importedNames = new Set<string>()
    const sites: GateCallSite[] = []

    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !DECLARATIONS_IMPORT.test(statement.moduleSpecifier.text)
      ) {
        continue
      }
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        bindings.elements.forEach((element) => importedNames.add(element.name.text))
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        importedNames.add(bindings.name.text)
      }
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'permissionGate'
      ) {
        const [argument] = node.arguments
        const root = argument ? rootIdentifier(argument) : null
        sites.push({
          file: relative(process.cwd(), path),
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          argument: argument ? argument.getText(source) : '(sin argumento)',
          imported: node.arguments.length === 1 && root !== null && importedNames.has(root.text),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)

    return sites
  })
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

  test('cada archivo *_permission_declarations.ts exporta al menos una declaración del gate', async ({
    assert,
  }) => {
    // Sin este piso, un archivo que exportara solo fábricas o que cambiara de
    // forma dejaría el contrato de abajo en verde sin revisar nada.
    const discovered = await discoverGateDeclarations()

    assert.isAbove(discovered.length, 0, 'no se encontró ningún archivo de declaraciones')
    assert.deepEqual(
      discovered.filter(({ options }) => options.length === 0).map(({ file }) => file),
      []
    )
  })

  test('toda declaración del gate apunta a un módulo con exigencia encendida y a un permiso declarado', async ({
    assert,
  }) => {
    // Con la exigencia apagada, `permissionGate` deja pasar a cualquier usuario
    // autenticado: la ruta queda abierta aunque tenga su declaración.
    const modulesBySlug = new Map(
      SYSTEM_MODULES.map((systemModule) => [systemModule.systemModuleSlug as string, systemModule])
    )
    const discovered = await discoverGateDeclarations()

    const problems = discovered.flatMap(({ file, options: fileOptions }) =>
      fileOptions.flatMap((options) => {
        const systemModule = modulesBySlug.get(options.module)
        if (!systemModule) {
          return [`${file} -> ${options.module}: módulo inexistente en la constante`]
        }
        if (!systemModule.systemModulePermissionEnforcementActive) {
          return [`${file} -> ${options.module}: exigencia apagada`]
        }

        const declared = new Set<string>(
          systemModule.systemModulePermissions.map((permission) => permission.systemPermissionSlug)
        )
        const actions = typeof options.action === 'string' ? [options.action] : options.action

        return actions
          .filter((action) => !declared.has(action))
          .map((action) => `${file} -> ${options.module}:${action}: permiso no declarado`)
      })
    )

    assert.deepEqual([...new Set(problems)], [])
  })

  test('toda ruta toma su declaración del gate de un import de #constants/*_permission_declarations', ({
    assert,
  }) => {
    // El caso de arriba solo ve lo que vive en `app/constants`: una declaración
    // escrita en el archivo de rutas (así estaba el reporte de cobertura REPSE)
    // podía apuntar a un módulo apagado o a un permiso inexistente sin que nada
    // fallara.
    const sites = collectGateCallSites()
    const outside = sites
      .filter((site) => !site.imported)
      .map((site) => `${site.file}:${site.line} -> ${site.argument}`)

    assert.isAbove(sites.length, 0, 'sin llamadas a permissionGate el caso no prueba nada')
    assert.deepEqual(outside, [])
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
