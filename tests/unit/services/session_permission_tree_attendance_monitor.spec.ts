import { test } from '@japa/runner'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import type User from '#models/user'
import SessionPermissionTreeService from '#services/session_permission_tree_service'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'
import SystemPermissionCatalogConsistencyService from '#services/system_permission_catalog_consistency_service'
import { ATTENDANCE_MONITOR_PERMISSION_CATALOG } from '#constants/attendance_monitor_permission_catalog'

const MONITOR_SLUG = 'employees-attendance-monitor'
const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ROLE_SLUG = `monitor-tree-test-${STAMP}-plain-role`

function fakeUser(roleId: number): User {
  return { userId: roleId, roleId } as User
}

async function findMonitorPermission(slug: string): Promise<SystemPermission> {
  const moduleRow = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', MONITOR_SLUG)
    .first()
  if (!moduleRow) {
    throw new Error(`El módulo "${MONITOR_SLUG}" debería existir ya en la BD de pruebas.`)
  }
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', moduleRow.systemModuleId)
    .where('system_permission_slug', slug)
    .first()
  if (!permission) {
    throw new Error(`El permiso "${MONITOR_SLUG}:${slug}" debería estar sembrado desde 0018.`)
  }
  return permission
}

function monitorNodeFrom(
  tree: Awaited<ReturnType<SessionPermissionTreeService['buildForUser']>>
) {
  const node = tree.modules.find((moduleNode) => moduleNode.slug === MONITOR_SLUG)
  if (!node) {
    throw new Error('El árbol debe incluir el módulo del monitor de asistencia.')
  }
  return node
}

test.group('Árbol de sesión — monitor de asistencia (USRH1787433076991)', (group) => {
  let plainRole: Role

  group.setup(async () => {
    plainRole = await Role.create({
      roleName: 'Test Attendance Monitor Tree Role',
      roleSlug: ROLE_SLUG,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
    })
  })

  group.teardown(async () => {
    const grants = await RoleSystemPermission.query()
      .where('role_id', plainRole.roleId)
      .withTrashed()
    for (const grant of grants) {
      await grant.forceDelete()
    }
    await plainRole.forceDelete()
  })

  test('CA-1: el nodo del monitor llega con 4 secciones y 11 acciones, no vacío', async ({
    assert,
  }) => {
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
    const node = monitorNodeFrom(tree)

    assert.lengthOf(node.sections, 4)
    assert.lengthOf(
      node.sections.flatMap((section) => section.actions),
      11
    )
  })

  test('CA-1: un grant real de download-summary llega como allowed/assignment', async ({
    assert,
  }) => {
    const permission = await findMonitorPermission('download-summary')
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: permission.systemPermissionId,
    })

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(
        fakeUser(plainRole.roleId)
      )
      const actions = monitorNodeFrom(tree).sections.flatMap((section) => section.actions)
      const summary = actions.find((action) => action.slug === 'download-summary')
      const payroll = actions.find((action) => action.slug === 'see-payroll')

      assert.isTrue(summary?.allowed)
      assert.equal(summary?.reason, 'assignment')
      assert.isFalse(payroll?.allowed)
      assert.equal(payroll?.reason, 'missing-assignment')
    } finally {
      await grant.forceDelete()
    }
  })

  test('CA-5: un rol privilegiado ve las 11 por privileged-role, sin grants', async ({
    assert,
  }) => {
    const owner = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')
      .firstOrFail()
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(owner.roleId))
    const actions = monitorNodeFrom(tree).sections.flatMap((section) => section.actions)

    assert.lengthOf(actions, 11)
    assert.isTrue(
      actions.every((action) => action.allowed && action.reason === 'privileged-role')
    )
  })

  test('regla 8: sincronizar el catálogo no crea filas ni toca las concesiones', async ({
    assert,
  }) => {
    const countGrants = async (): Promise<number> => {
      const rows = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .count('* as total')
      return Number((rows[0] as unknown as { $extras: { total: number } }).$extras.total)
    }

    const grantsBefore = await countGrants()
    const first = await new SystemPermissionCatalogSyncService().sync()
    const second = await new SystemPermissionCatalogSyncService().sync()
    const grantsAfter = await countGrants()

    const monitorSlugs = ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)
    for (const created of [...first.createdPermissionSlugs, ...second.createdPermissionSlugs]) {
      assert.notInclude(monitorSlugs, created)
    }
    assert.isEmpty(
      first.skippedActions.filter((skipped) => monitorSlugs.includes(skipped.slug as never))
    )
    assert.equal(grantsAfter, grantsBefore)
  })

  test('la revisión de consistencia deja de reportar deuda del monitor y no gana hallazgos', async ({
    assert,
  }) => {
    const report = await new SystemPermissionCatalogConsistencyService().checkConsistency()
    const monitorSlugs = ATTENDANCE_MONITOR_PERMISSION_CATALOG.map((action) => action.slug)

    assert.notInclude(report.knownDebtModules, MONITOR_SLUG)
    assert.isEmpty(
      report.declaredNotRegistered.filter((finding) => monitorSlugs.includes(finding.slug as never))
    )
    assert.isEmpty(
      report.registeredNotDeclared.filter((finding) => monitorSlugs.includes(finding.slug as never))
    )
  })
})
