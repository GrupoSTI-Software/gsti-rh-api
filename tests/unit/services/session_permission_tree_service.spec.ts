import { test } from '@japa/runner'
import SessionPermissionTreeService from '#services/session_permission_tree_service'
import SessionPermissionTreeUnresolvedError from '#exceptions/session_permission_tree_unresolved_error'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import type User from '#models/user'
import { SYSTEM_PERMISSION_CATALOG, SYSTEM_MODULES_CATALOG } from '#constants/system_permission_catalog'

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const TEST_SLUG_PREFIX = `session-tree-test-${STAMP}`
const ROLE_SLUG = `${TEST_SLUG_PREFIX}-plain-role`
const ORPHAN_PERMISSION_SLUG = `${TEST_SLUG_PREFIX}-orphan-action`

function fakeUser(roleId: number): User {
  return { userId: roleId, roleId } as User
}

async function findRole(slug: string): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(`El rol "${slug}" es requerido para este test. Ejecuta los seeders primero.`)
  }
  return role
}

async function findEmployeesModule(): Promise<SystemModule> {
  const moduleRow = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .first()
  if (!moduleRow) {
    throw new Error('El módulo "employees" debería existir ya en la BD de pruebas.')
  }
  return moduleRow
}

async function findEmployeesPermission(slug: string): Promise<SystemPermission> {
  const moduleRow = await findEmployeesModule()
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_module_id', moduleRow.systemModuleId)
    .where('system_permission_slug', slug)
    .first()
  if (!permission) {
    throw new Error(`El permiso "employees:${slug}" debería existir ya en la BD de pruebas.`)
  }
  return permission
}

function employeesModuleFrom(tree: Awaited<ReturnType<SessionPermissionTreeService['buildForUser']>>) {
  const moduleNode = tree.modules.find((node) => node.slug === 'employees')
  if (!moduleNode) {
    throw new Error('El árbol debe incluir el módulo employees.')
  }
  return moduleNode
}

function employeesActionFrom(
  tree: Awaited<ReturnType<SessionPermissionTreeService['buildForUser']>>,
  slug: string
) {
  const moduleNode = employeesModuleFrom(tree)
  const action = moduleNode.sections.flatMap((section) => section.actions).find((node) => node.slug === slug)
  if (!action) {
    throw new Error(`El árbol debe incluir la acción employees:${slug}.`)
  }
  return action
}

test.group('SessionPermissionTreeService', (group) => {
  let plainRole: Role

  group.setup(async () => {
    plainRole = await Role.create({
      roleName: 'Test Session Permission Tree Role',
      roleSlug: ROLE_SLUG,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
    })
  })

  group.teardown(async () => {
    const roles = await Role.query().where('role_slug', 'like', `${TEST_SLUG_PREFIX}%`).withTrashed()
    const roleIds = roles.map((role) => role.roleId)
    if (roleIds.length > 0) {
      const grants = await RoleSystemPermission.query().whereIn('role_id', roleIds).withTrashed()
      for (const grant of grants) {
        await grant.forceDelete()
      }
    }

    const permissions = await SystemPermission.query()
      .where('system_permission_slug', 'like', `${TEST_SLUG_PREFIX}%`)
      .withTrashed()
    for (const permission of permissions) {
      await permission.forceDelete()
    }

    for (const role of roles) {
      await role.forceDelete()
    }
  })

  test('usuario con rol inexistente lanza SessionPermissionTreeUnresolvedError', async ({
    assert,
  }) => {
    const service = new SessionPermissionTreeService()

    try {
      await service.buildForUser(fakeUser(999999999))
      assert.fail('debía lanzar SessionPermissionTreeUnresolvedError')
    } catch (error) {
      assert.instanceOf(error, SessionPermissionTreeUnresolvedError)
    }
  })

  test('rol plano con grant real de employees:read marca asignación y faltante', async ({
    assert,
  }) => {
    const readPermission = await findEmployeesPermission('read')
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
      const readAction = employeesActionFrom(tree, 'read')
      const createAction = employeesActionFrom(tree, 'create')

      assert.isTrue(readAction.allowed)
      assert.equal(readAction.reason, 'assignment')
      assert.isFalse(createAction.allowed)
      assert.equal(createAction.reason, 'missing-assignment')
    } finally {
      await grant.delete()
    }
  })

  test('grant de sensitive-identificacion-read no exige reveal-sensitive-data', async ({
    assert,
  }) => {
    const permission = await findEmployeesPermission('sensitive-identificacion-read')
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: permission.systemPermissionId,
    })

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
      const readAction = employeesActionFrom(tree, 'sensitive-identificacion-read')
      const writeAction = employeesActionFrom(tree, 'sensitive-identificacion-write')

      assert.isTrue(readAction.allowed)
      assert.equal(readAction.reason, 'assignment')
      assert.isFalse(writeAction.allowed)
    } finally {
      await grant.delete()
    }
  })

  test('rol owner sin grants de employees ve acciones standard como rol privilegiado', async ({
    assert,
  }) => {
    const owner = await findRole('owner')
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(owner.roleId))
    const readAction = employeesActionFrom(tree, 'read')
    const createAction = employeesActionFrom(tree, 'create')

    assert.isTrue(readAction.allowed)
    assert.equal(readAction.reason, 'privileged-role')
    assert.isTrue(createAction.allowed)
    assert.equal(createAction.reason, 'privileged-role')
  })

  test('módulo employees inactivo marca todas sus acciones como module-inactive', async ({
    assert,
  }) => {
    const employeesModule = await findEmployeesModule()
    const originalActive = employeesModule.systemModuleActive

    employeesModule.systemModuleActive = 0
    await employeesModule.save()

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
      const moduleNode = employeesModuleFrom(tree)

      assert.isFalse(moduleNode.active)
      assert.isTrue(
        moduleNode.sections
          .flatMap((section) => section.actions)
          .every((action) => !action.allowed && action.reason === 'module-inactive')
      )
    } finally {
      employeesModule.systemModuleActive = originalActive
      await employeesModule.save()
    }
  })

  test('la versión cambia tras crear un grant nuevo del rol', async ({ assert }) => {
    const service = new SessionPermissionTreeService()
    const before = await service.getVersionForUser(fakeUser(plainRole.roleId))
    const readPermission = await findEmployeesPermission('read')
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const after = await service.getVersionForUser(fakeUser(plainRole.roleId))

      assert.notEqual(after.version, before.version)
      assert.isString(after.generatedAt)
    } finally {
      await grant.delete()
    }
  })

  test('la versión cambia al revocar un grant que no es el más reciente', async ({ assert }) => {
    const service = new SessionPermissionTreeService()
    const readPermission = await findEmployeesPermission('read')
    const createPermission = await findEmployeesPermission('create')
    const olderGrant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })
    const latestGrant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: createPermission.systemPermissionId,
    })

    try {
      const before = await service.getVersionForUser(fakeUser(plainRole.roleId))
      await olderGrant.delete()
      const after = await service.getVersionForUser(fakeUser(plainRole.roleId))

      assert.notEqual(after.version, before.version)
    } finally {
      await olderGrant.forceDelete()
      await latestGrant.forceDelete()
    }
  })

  test('grant huérfano no aparece en el árbol ni bloquea el resto', async ({ assert }) => {
    const employeesModule = await findEmployeesModule()
    const orphanPermission = await SystemPermission.create({
      systemPermissionName: 'Permiso huérfano de prueba',
      systemPermissionSlug: ORPHAN_PERMISSION_SLUG,
      systemModuleId: employeesModule.systemModuleId,
    })
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: orphanPermission.systemPermissionId,
    })

    try {
      const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
      const actionSlugs = employeesModuleFrom(tree).sections.flatMap((section) =>
        section.actions.map((action) => action.slug)
      )

      assert.notInclude(actionSlugs, ORPHAN_PERMISSION_SLUG)
      assert.exists(employeesActionFrom(tree, 'read'))
    } finally {
      await grant.forceDelete()
      await orphanPermission.forceDelete()
    }
  })

  test('incluye todos los módulos del catálogo y los no enumerados sin secciones', async ({
    assert,
  }) => {
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))

    assert.deepEqual(
      tree.modules.map((moduleNode) => moduleNode.slug),
      SYSTEM_MODULES_CATALOG.map((moduleEntry) => moduleEntry.slug)
    )

    const nonEnumeratedModules = tree.modules.filter((moduleNode) => moduleNode.slug !== 'employees')
    assert.isTrue(nonEnumeratedModules.every((moduleNode) => moduleNode.sections.length === 0))
  })

  test('employees conserva orden de secciones y acciones no revocables para privilegiados', async ({
    assert,
  }) => {
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
    const employeesModule = employeesModuleFrom(tree)
    const expectedSections = Array.from(
      new Set(SYSTEM_PERMISSION_CATALOG.actionsByModule.employees.map((action) => action.section))
    )

    assert.deepEqual(
      employeesModule.sections.map((section) => section.slug),
      expectedSections
    )
    assert.isTrue(
      employeesModule.sections
        .flatMap((section) => section.actions)
        .every((action) => action.revocableFromPrivileged === false)
    )
  })

  test('grantable refleja la exención del catálogo acción por acción', async ({ assert }) => {
    const tree = await new SessionPermissionTreeService().buildForUser(fakeUser(plainRole.roleId))
    const actionsBySlug = new Map(
      employeesModuleFrom(tree)
        .sections.flatMap((section) => section.actions)
        .map((action) => [action.slug, action])
    )

    for (const catalogAction of SYSTEM_PERMISSION_CATALOG.actionsByModule.employees) {
      const action = actionsBySlug.get(catalogAction.slug)
      assert.exists(action, `falta la acción employees:${catalogAction.slug} en el árbol`)
      assert.equal(
        action!.grantable,
        !('exemption' in catalogAction && catalogAction.exemption),
        `grantable incorrecto para employees:${catalogAction.slug}`
      )
    }
  })
})
