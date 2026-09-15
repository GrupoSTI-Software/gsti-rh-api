import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { BRANCH_OFFICES_PERMISSION_DECLARATIONS } from '#constants/branch_offices_permission_declarations'
import { SHIFTS_PERMISSION_DECLARATIONS } from '#constants/shifts_permission_declarations'
import { ZONES_PERMISSION_DECLARATIONS } from '#constants/zones_permission_declarations'

/**
 * Protección vigente de Sucursales, Zonas y Turnos en el API: qué ruta declara
 * `permissionGate` y cuál queda abierta a propósito. Las lecturas abiertas son
 * catálogos que consumen otras pantallas; si alguien les pone gate, esas
 * pantallas responden 403 aunque el rol administre bien su propio módulo.
 */

const readRoutes = (fileName: string) =>
  readFileSync(join(process.cwd(), 'start/routes', fileName), 'utf-8')

/** Sin espacios ni saltos, para no depender del formato de la cadena. */
const compact = (content: string) => content.replace(/\s+/g, '')

function assertGated(
  assert: Assert,
  content: string,
  route: { method: string; path: string; handler: string; declaration: string }
) {
  assert.include(
    compact(content),
    compact(
      `router.${route.method}('${route.path}', '#controllers/${route.handler}')` +
        `.use(middleware.permissionGate(${route.declaration}))`
    ),
    `${route.method.toUpperCase()} ${route.path} debe declarar ${route.declaration}`
  )
}

function assertOpen(
  assert: Assert,
  content: string,
  route: { method: string; path: string; handler: string }
) {
  const flat = compact(content)
  const declaration = compact(`router.${route.method}('${route.path}', '#controllers/${route.handler}')`)
  const index = flat.indexOf(declaration)

  assert.isAbove(index, -1, `${route.method.toUpperCase()} ${route.path} debe existir`)
  assert.isFalse(
    flat.slice(index + declaration.length).startsWith('.use('),
    `${route.method.toUpperCase()} ${route.path} debe quedar sin gate`
  )
}

/** Un solo `permissionGate` por ruta: el conteo del archivo delata un gate apilado. */
const gateCount = (content: string) => (content.match(/middleware\.permissionGate\(/g) ?? []).length

test.group('Sucursales — permissionGate en start/routes/branch_offices.ts', () => {
  test('alta, detalle, edición y baja declaran su permiso; el listado queda abierto', ({
    assert,
  }) => {
    const content = readRoutes('branch_offices.ts')

    assertGated(assert, content, {
      method: 'post',
      path: '/branch-offices',
      handler: 'branch_offices_controller.store',
      declaration: 'BRANCH_OFFICES_PERMISSION_DECLARATIONS.storeBranchOffice',
    })
    assertGated(assert, content, {
      method: 'get',
      path: '/branch-offices/:id',
      handler: 'branch_offices_controller.show',
      declaration: 'BRANCH_OFFICES_PERMISSION_DECLARATIONS.showBranchOffice',
    })
    assertGated(assert, content, {
      method: 'put',
      path: '/branch-offices/:id',
      handler: 'branch_offices_controller.update',
      declaration: 'BRANCH_OFFICES_PERMISSION_DECLARATIONS.updateBranchOffice',
    })
    assertGated(assert, content, {
      method: 'delete',
      path: '/branch-offices/:id',
      handler: 'branch_offices_controller.destroy',
      declaration: 'BRANCH_OFFICES_PERMISSION_DECLARATIONS.destroyBranchOffice',
    })
    assertOpen(assert, content, {
      method: 'get',
      path: '/branch-offices',
      handler: 'branch_offices_controller.index',
    })
    assert.equal(gateCount(content), 4)
    assert.include(content, 'middleware.auth()')
    assert.include(content, 'middleware.businessScope()')
  })

  test('las declaraciones piden el permiso de sucursales con bypass standard', ({ assert }) => {
    assert.deepEqual(BRANCH_OFFICES_PERMISSION_DECLARATIONS, {
      storeBranchOffice: { module: 'branch-offices', action: 'create', bypass: 'standard' },
      showBranchOffice: { module: 'branch-offices', action: 'read', bypass: 'standard' },
      updateBranchOffice: { module: 'branch-offices', action: 'update', bypass: 'standard' },
      destroyBranchOffice: { module: 'branch-offices', action: 'delete', bypass: 'standard' },
    })
  })
})

test.group('Zonas — permissionGate en start/routes/zone_routes.ts', () => {
  test('alta, detalle, edición, baja y miniatura declaran su permiso; el listado queda abierto', ({
    assert,
  }) => {
    const content = readRoutes('zone_routes.ts')

    assertGated(assert, content, {
      method: 'post',
      path: '/',
      handler: 'zone_controller.store',
      declaration: 'ZONES_PERMISSION_DECLARATIONS.storeZone',
    })
    assertGated(assert, content, {
      method: 'get',
      path: '/:zoneId',
      handler: 'zone_controller.show',
      declaration: 'ZONES_PERMISSION_DECLARATIONS.showZone',
    })
    assertGated(assert, content, {
      method: 'put',
      path: '/:zoneId',
      handler: 'zone_controller.update',
      declaration: 'ZONES_PERMISSION_DECLARATIONS.updateZone',
    })
    assertGated(assert, content, {
      method: 'delete',
      path: '/:zoneId',
      handler: 'zone_controller.delete',
      declaration: 'ZONES_PERMISSION_DECLARATIONS.deleteZone',
    })
    assertGated(assert, content, {
      method: 'put',
      path: '/:zoneId/thumbnail',
      handler: 'zone_controller.uploadThumbnail',
      declaration: 'ZONES_PERMISSION_DECLARATIONS.uploadZoneThumbnail',
    })
    assertOpen(assert, content, { method: 'get', path: '/', handler: 'zone_controller.index' })
    assert.equal(gateCount(content), 5)
    assert.include(content, 'middleware.auth()')
  })

  test('la miniatura acepta create o update porque se sube tras crear y tras editar', ({
    assert,
  }) => {
    assert.deepEqual(ZONES_PERMISSION_DECLARATIONS, {
      storeZone: { module: 'zones', action: 'create', bypass: 'standard' },
      showZone: { module: 'zones', action: 'read', bypass: 'standard' },
      updateZone: { module: 'zones', action: 'update', bypass: 'standard' },
      deleteZone: { module: 'zones', action: 'delete', bypass: 'standard' },
      uploadZoneThumbnail: { module: 'zones', action: ['create', 'update'], bypass: 'standard' },
    })
  })
})

test.group('Turnos — permissionGate en shift_routes.ts y shift_for_employees.ts', () => {
  test('alta, edición, baja y la búsqueda por puesto/departamento declaran su permiso; listado y detalle quedan abiertos', ({
    assert,
  }) => {
    const content = readRoutes('shift_routes.ts')

    assertGated(assert, content, {
      method: 'post',
      path: '/shift',
      handler: 'shifts_controller.store',
      declaration: 'SHIFTS_PERMISSION_DECLARATIONS.storeShift',
    })
    assertGated(assert, content, {
      method: 'get',
      path: '/shift-department-position',
      handler: 'shifts_controller.searchPositionDepartment',
      declaration: 'SHIFTS_PERMISSION_DECLARATIONS.searchShiftsByPositionDepartment',
    })
    assertGated(assert, content, {
      method: 'put',
      path: '/shift/:id',
      handler: 'shifts_controller.update',
      declaration: 'SHIFTS_PERMISSION_DECLARATIONS.updateShift',
    })
    assertGated(assert, content, {
      method: 'delete',
      path: '/shift/:id',
      handler: 'shifts_controller.destroy',
      declaration: 'SHIFTS_PERMISSION_DECLARATIONS.destroyShift',
    })
    assertOpen(assert, content, { method: 'get', path: '/shift', handler: 'shifts_controller.index' })
    assertOpen(assert, content, { method: 'get', path: '/shift/:id', handler: 'shifts_controller.show' })
    assert.equal(gateCount(content), 4)
  })

  test('shift-for-employees declara shifts:read', ({ assert }) => {
    const content = readRoutes('shift_for_employees.ts')

    assertGated(assert, content, {
      method: 'post',
      path: '/shift-for-employees',
      handler: 'shift_for_employees_controller.index',
      declaration: 'SHIFTS_PERMISSION_DECLARATIONS.indexShiftsForEmployees',
    })
    assert.equal(gateCount(content), 1)
    assert.include(content, 'middleware.auth()')
  })

  test('las declaraciones piden el permiso de turnos con bypass standard', ({ assert }) => {
    assert.deepEqual(SHIFTS_PERMISSION_DECLARATIONS, {
      storeShift: { module: 'shifts', action: 'create', bypass: 'standard' },
      searchShiftsByPositionDepartment: { module: 'shifts', action: 'read', bypass: 'standard' },
      updateShift: { module: 'shifts', action: 'update', bypass: 'standard' },
      destroyShift: { module: 'shifts', action: 'delete', bypass: 'standard' },
      indexShiftsForEmployees: { module: 'shifts', action: 'read', bypass: 'standard' },
    })
  })
})
