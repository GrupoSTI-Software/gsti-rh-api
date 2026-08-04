import { test } from '@japa/runner'
import PermissionGateService from '#services/permission_gate_service'
import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import type User from '#models/user'

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const MODULE_SLUG = `test-permgate-module-${STAMP}`
const ROLE_SLUG = `test-permgate-role-${STAMP}`

function fakeUser(roleId: number): User {
  return { userId: roleId, roleId } as User
}

async function findPrivilegedRole(slug: string): Promise<Role> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', slug).first()
  if (!role) {
    throw new Error(`El rol "${slug}" es requerido para este test. Ejecuta los seeders primero.`)
  }
  return role
}

test.group('PermissionGateService', (group) => {
  let testModule: SystemModule
  let readPermission: SystemPermission
  let plainRole: Role

  group.setup(async () => {
    testModule = await SystemModule.create({
      systemModuleName: 'Test PermGate Module',
      systemModuleSlug: MODULE_SLUG,
      systemModuleDescription: 'Fixture de test',
      systemModules: 1,
      systemModulePath: `/${MODULE_SLUG}`,
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })
    readPermission = await SystemPermission.create({
      systemPermissionName: 'Read',
      systemPermissionSlug: 'read',
      systemModuleId: testModule.systemModuleId,
    })
    plainRole = await Role.create({
      roleName: 'Test PermGate Role',
      roleSlug: ROLE_SLUG,
      roleDescription: 'Fixture de test',
      roleActive: 1,
      roleBusinessAccess: '',
    })
  })

  group.teardown(async () => {
    await RoleSystemPermission.query().where('role_id', plainRole.roleId).delete()
    await SystemPermission.query().where('system_permission_id', readPermission.systemPermissionId).delete()
    await SystemModule.query().where('system_module_id', testModule.systemModuleId).delete()
    await Role.query().where('role_id', plainRole.roleId).delete()
  })

  test('interruptor apagado: permite sin resolver identidad', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(null, {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isTrue(decision.allowed)
    assert.equal(decision.reason, 'module-not-enforced')
  })

  test('variante standard: root y owner tienen bypass', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const root = await findPrivilegedRole('root')
    const owner = await findPrivilegedRole('owner')
    const service = new PermissionGateService()

    const rootDecision = await service.evaluate(fakeUser(root.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })
    const ownerDecision = await service.evaluate(fakeUser(owner.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isTrue(rootDecision.allowed)
    assert.equal(rootDecision.reason, 'bypass')
    assert.isTrue(ownerDecision.allowed)
    assert.equal(ownerDecision.reason, 'bypass')
  })

  test('variante standard: super-administrador NO tiene bypass', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const direccionGeneral = await findPrivilegedRole('super-administrador')
    const service = new PermissionGateService()

    const decision = await service.evaluate(fakeUser(direccionGeneral.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
  })

  test('variante expanded: super-administrador SÍ tiene bypass', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const direccionGeneral = await findPrivilegedRole('super-administrador')
    const service = new PermissionGateService()

    const decision = await service.evaluate(fakeUser(direccionGeneral.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'expanded',
    })

    assert.isTrue(decision.allowed)
    assert.equal(decision.reason, 'bypass')
  })

  test('variante platformReserved: solo root tiene bypass', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const root = await findPrivilegedRole('root')
    const owner = await findPrivilegedRole('owner')
    const service = new PermissionGateService()

    const rootDecision = await service.evaluate(fakeUser(root.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'platformReserved',
    })
    const ownerDecision = await service.evaluate(fakeUser(owner.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'platformReserved',
    })

    assert.isTrue(rootDecision.allowed)
    assert.isFalse(ownerDecision.allowed)
    assert.equal(ownerDecision.reason, 'denied')
  })

  test('variante strict: nadie tiene bypass, ni root', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const root = await findPrivilegedRole('root')
    const service = new PermissionGateService()

    const decision = await service.evaluate(fakeUser(root.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
  })

  test('rol sin bypass con permiso concedido: permite', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const service = new PermissionGateService()
      const decision = await service.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: 'read',
        bypass: 'strict',
      })

      assert.isTrue(decision.allowed)
      assert.equal(decision.reason, 'granted')
    } finally {
      await grant.delete()
    }
  })

  test('rol sin bypass sin permiso concedido: deniega', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(fakeUser(plainRole.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
  })

  test('usuario nulo: se niega distinguible como no resuelto', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(null, {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'unresolved')
  })

  test('rol inexistente: se niega distinguible como no resuelto', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(fakeUser(999999999), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'unresolved')
  })

  test('módulo inexistente: se trata como exigido y deniega (caso real del piloto REPSE)', async ({ assert }) => {
    const service = new PermissionGateService()
    const decision = await service.evaluate(fakeUser(plainRole.roleId), {
      module: `${MODULE_SLUG}-does-not-exist`,
      action: 'read',
      bypass: 'expanded',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
  })

  test('cachea la resolución: un cambio en BD entre dos llamadas de la misma instancia no afecta la segunda', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const service = new PermissionGateService()
    const first = await service.evaluate(fakeUser(plainRole.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'strict',
    })
    assert.isFalse(first.allowed)
    assert.equal(first.reason, 'denied')

    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const second = await service.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: 'read',
        bypass: 'strict',
      })
      assert.isFalse(second.allowed, 'misma instancia ⇒ respuesta cacheada, no debe ver la nueva concesión')
      assert.equal(second.reason, 'denied')

      const freshService = new PermissionGateService()
      const third = await freshService.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: 'read',
        bypass: 'strict',
      })
      assert.isTrue(third.allowed, 'una instancia nueva (petición nueva) sí ve el cambio')
      assert.equal(third.reason, 'granted')
    } finally {
      await grant.delete()
    }
  })
})
