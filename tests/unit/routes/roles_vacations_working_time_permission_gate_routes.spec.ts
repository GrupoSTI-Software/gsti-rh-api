import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS } from '#constants/roles_and_permissions_permission_declarations'
import { VACATIONS_PERMISSION_DECLARATIONS } from '#constants/vacations_permission_declarations'
import { WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS } from '#constants/working_time_overrides_permission_declarations'
import { REFORM_SIMULATION_PERMISSION_DECLARATIONS } from '#constants/reform_simulation_permission_declarations'

/**
 * Protección vigente en el API de Roles y permisos, Periodos vacacionales,
 * Políticas de jornada 40 hrs y Simulador de reforma: qué ruta declara
 * `permissionGate`, con qué declaración, y cuál queda abierta a propósito.
 *
 * Las abiertas las consume otra pantalla o la sesión (menú, guard de cada
 * página, Usuarios, turnos del empleado, expediente de vacaciones). Si alguien
 * les pone gate, esas pantallas responden 403 a roles que no administran el
 * módulo.
 */

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface RouteRef {
  method: HttpMethod
  path: string
  handler: string
}

interface GatedRouteRef extends RouteRef {
  /** Expresión con la que la ruta referencia su declaración (alias.clave). */
  gate: string
}

const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf-8')

/** Sin espacios ni saltos, para no depender del formato de la cadena. */
const compact = (content: string) => content.replace(/\s+/g, '')

const GATE_CALL = 'middleware.permissionGate('

/**
 * Middleware encadenado a una ruta: desde su declaración hasta la siguiente
 * ruta o el cierre del grupo.
 */
function routeChain(assert: Assert, content: string, route: RouteRef): string {
  const flat = compact(content)
  const head = compact(`router.${route.method}('${route.path}', '${route.handler}')`)
  const index = flat.indexOf(head)

  assert.isAbove(index, -1, `${route.method.toUpperCase()} ${route.path} debe existir`)

  const rest = flat.slice(index + head.length)
  const end = rest.search(/router\.(get|post|put|patch|delete)\(|\}\)\.prefix\(/)
  return end === -1 ? rest : rest.slice(0, end)
}

/** La ruta declara exactamente su gate: uno solo, el esperado. */
function assertGated(assert: Assert, content: string, route: GatedRouteRef): void {
  const chain = routeChain(assert, content, route)
  const label = `${route.method.toUpperCase()} ${route.path}`

  assert.include(chain, `.use(${GATE_CALL}${route.gate}))`, `${label} debe declarar ${route.gate}`)
  assert.equal(chain.split(GATE_CALL).length - 1, 1, `${label} debe tener un solo permissionGate`)
}

function assertOpen(assert: Assert, content: string, route: RouteRef): void {
  assert.notInclude(
    routeChain(assert, content, route),
    GATE_CALL,
    `${route.method.toUpperCase()} ${route.path} debe quedar sin gate`
  )
}

/**
 * El gate lee `ctx.auth.user`: el grupo monta `auth()` como primer middleware.
 * En Adonis el middleware del grupo corre antes que el de la ruta.
 */
function assertGroupStartsWithAuth(assert: Assert, content: string, prefix: string): void {
  const flat = compact(content)
  const head = `.prefix('${prefix}')`
  const index = flat.indexOf(head)

  assert.isAbove(index, -1, `el grupo ${prefix} debe existir`)
  const afterPrefix = flat.slice(index + head.length)
  assert.isTrue(
    afterPrefix.startsWith('.use(middleware.auth())') ||
      afterPrefix.startsWith('.use([middleware.auth(),'),
    `el grupo ${prefix} debe montar auth() primero`
  )
}

/** Construye referencias con la clave tipada: una clave inexistente no compila. */
function gated<T extends Record<string, PermissionGateOptions>>(
  alias: string,
  _declarations: T,
  routes: Array<RouteRef & { key: keyof T & string }>
): GatedRouteRef[] {
  return routes.map(({ key, ...route }) => ({ ...route, gate: `${alias}.${key}` }))
}

test.group('Roles, vacaciones y jornada — declaraciones del gate', () => {
  test('roles-and-permissions: bypass standard y el verbo de cada operación', ({ assert }) => {
    const expected: Record<keyof typeof ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS, string | string[]> = {
      showRole: 'read',
      storeRole: 'create',
      updateRole: 'update',
      destroyRole: ['delete', 'update'],
      assignRolePermissions: 'update',
      assignRolesPermissionsBatch: 'update',
      hasAccessDepartment: 'read',
      indexRolePresets: 'read',
      previewRolePreset: 'update',
      applyRolePreset: 'update',
      storeRoleWithPreset: 'update',
      readOtherRoleAccess: 'read',
      indexRolesWithGrants: 'read',
    }

    for (const [name, declaration] of Object.entries(ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS)) {
      const key = name as keyof typeof expected
      assert.equal(declaration.module, 'roles-and-permissions', `${key}: módulo`)
      assert.equal(declaration.bypass, 'standard', `${key}: bypass`)
      assert.deepEqual(declaration.action, expected[key], `${key}: acción`)
    }
  })

  test('vacations: escrituras con bypass platformReserved (tabla global, solo root)', ({
    assert,
  }) => {
    const expected: Record<keyof typeof VACATIONS_PERMISSION_DECLARATIONS, string> = {
      storeVacationSetting: 'create',
      updateVacationSetting: 'update',
      destroyVacationSetting: 'delete',
    }

    for (const [name, declaration] of Object.entries(VACATIONS_PERMISSION_DECLARATIONS)) {
      const key = name as keyof typeof expected
      assert.equal(declaration.module, 'vacations', `${key}: módulo`)
      assert.equal(declaration.bypass, 'platformReserved', `${key}: bypass`)
      assert.equal(declaration.action, expected[key], `${key}: acción`)
    }
  })

  test('working-time-overrides y reform-simulation: bypass standard', ({ assert }) => {
    const expected: Record<keyof typeof WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS, string> = {
      indexOverrides: 'read',
      storeOverride: 'create',
      updateOverride: 'update',
      destroyOverride: 'delete',
    }

    for (const [name, declaration] of Object.entries(WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS)) {
      const key = name as keyof typeof expected
      assert.equal(declaration.module, 'working-time-overrides', `${key}: módulo`)
      assert.equal(declaration.bypass, 'standard', `${key}: bypass`)
      assert.equal(declaration.action, expected[key], `${key}: acción`)
    }

    assert.deepEqual(REFORM_SIMULATION_PERMISSION_DECLARATIONS.simulate, {
      module: 'reform-simulation',
      action: 'read',
      bypass: 'standard',
    })
  })
})

test.group('Roles y permisos — start/routes/role_routes.ts y role_preset_routes.ts', () => {
  const handler = (method: string) => `#controllers/role_controller.${method}`
  const presetHandler = (method: string) => `#controllers/role_preset_controller.${method}`

  test('las escrituras, el detalle y has-access-department declaran su gate', ({ assert }) => {
    const content = readSource('start/routes/role_routes.ts')
    assertGroupStartsWithAuth(assert, content, '/api/roles')

    const routes = gated('ROLES', ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS, [
      { method: 'post', path: '/assign-batch', handler: handler('assignBatch'), key: 'assignRolesPermissionsBatch' },
      { method: 'post', path: '/assign/:roleId', handler: handler('assign'), key: 'assignRolePermissions' },
      { method: 'get', path: '/has-access-department/:roleId/:departmentId', handler: handler('hasAccessDepartment'), key: 'hasAccessDepartment' },
      { method: 'post', path: '/', handler: handler('store'), key: 'storeRole' },
      { method: 'put', path: '/:roleId', handler: handler('update'), key: 'updateRole' },
      { method: 'delete', path: '/:roleId', handler: handler('delete'), key: 'destroyRole' },
      { method: 'get', path: '/:roleId', handler: handler('show'), key: 'showRole' },
    ])

    for (const route of routes) {
      assertGated(assert, content, route)
    }
  })

  test('el listado y la plomería de sesión del menú quedan sin gate', ({ assert }) => {
    const content = readSource('start/routes/role_routes.ts')
    const routes: RouteRef[] = [
      { method: 'get', path: '/', handler: handler('index') },
      { method: 'get', path: '/has-access/:roleId/:systemModuleSlug/:systemPermissionSlug', handler: handler('hasAccess') },
      { method: 'get', path: '/get-access/:roleId', handler: handler('getAccess') },
      { method: 'get', path: '/get-access-by-module/:roleId/:systemModuleSlug', handler: handler('getAccessByModule') },
    ]

    for (const route of routes) {
      assertOpen(assert, content, route)
    }
  })

  test('catálogo, vista previa y aplicación de plantillas declaran su gate', ({ assert }) => {
    const content = readSource('start/routes/role_preset_routes.ts')
    assertGroupStartsWithAuth(assert, content, '/api/role-presets')
    assertGroupStartsWithAuth(assert, content, '/api/roles/:roleId')

    const routes = gated('ROLES', ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS, [
      { method: 'get', path: '/', handler: presetHandler('index'), key: 'indexRolePresets' },
      { method: 'post', path: '/role-presets/preview', handler: presetHandler('preview'), key: 'previewRolePreset' },
      { method: 'post', path: '/role-presets/apply', handler: presetHandler('apply'), key: 'applyRolePreset' },
    ])

    for (const route of routes) {
      assertGated(assert, content, route)
    }
  })
})

test.group('Periodos vacacionales — start/routes/vacations_routes.ts', () => {
  const handler = (method: string) => `#controllers/vacation_settings_controller.${method}`

  test('alta, edición y baja declaran su gate; listado y detalle quedan abiertos', ({ assert }) => {
    const content = readSource('start/routes/vacations_routes.ts')
    assertGroupStartsWithAuth(assert, content, '/api/vacations')

    const routes = gated('VACATIONS_PERMISSION_DECLARATIONS', VACATIONS_PERMISSION_DECLARATIONS, [
      { method: 'post', path: '/', handler: handler('store'), key: 'storeVacationSetting' },
      { method: 'put', path: '/:vacationSettingId', handler: handler('update'), key: 'updateVacationSetting' },
      { method: 'delete', path: '/:vacationSettingId', handler: handler('destroy'), key: 'destroyVacationSetting' },
    ])
    for (const route of routes) {
      assertGated(assert, content, route)
    }

    assertOpen(assert, content, { method: 'get', path: '/', handler: handler('index') })
    assertOpen(assert, content, { method: 'get', path: '/:vacationSettingId', handler: handler('show') })
  })
})

test.group('Jornada 40 hrs — overrides, effective, federal y simulador de reforma', () => {
  test('overrides: cada ruta declara su gate', ({ assert }) => {
    const content = readSource('app/modules/working-time-rules/overrides/overrides.routes.ts')
    const handler = (method: string) => `#modules/working-time-rules/overrides/overrides.controller.${method}`
    assertGroupStartsWithAuth(assert, content, '/api/v1/working-time-rules/overrides')

    const routes = gated('OVERRIDES', WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS, [
      { method: 'get', path: '/', handler: handler('index'), key: 'indexOverrides' },
      { method: 'post', path: '/', handler: handler('store'), key: 'storeOverride' },
      { method: 'patch', path: '/:id', handler: handler('update'), key: 'updateOverride' },
      { method: 'delete', path: '/:id', handler: handler('destroy'), key: 'destroyOverride' },
    ])
    for (const route of routes) {
      assertGated(assert, content, route)
    }
  })

  test('effective y federal quedan sin gate: los consumen turnos del empleado y es catálogo global', ({
    assert,
  }) => {
    for (const file of [
      'app/modules/working-time-rules/effective/effective.routes.ts',
      'app/modules/working-time-rules/federal/federal.routes.ts',
    ]) {
      assert.notInclude(compact(readSource(file)), GATE_CALL, `${file} no debe declarar gate`)
    }
  })

  test('el simulador de reforma declara reform-simulation:read', ({ assert }) => {
    const content = readSource('start/routes/reform_simulator_routes.ts')
    assertGroupStartsWithAuth(assert, content, '/api/v1/working-time-rules/reform-simulation')

    const [route] = gated('REFORM_SIMULATION_PERMISSION_DECLARATIONS', REFORM_SIMULATION_PERMISSION_DECLARATIONS, [
      { method: 'get', path: '/', handler: '#controllers/reform_simulator_controller.simulate', key: 'simulate' },
    ])
    assertGated(assert, content, route)
  })
})
