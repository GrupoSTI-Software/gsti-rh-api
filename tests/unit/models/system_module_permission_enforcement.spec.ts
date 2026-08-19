import { test } from '@japa/runner'
import SystemModule from '#models/system_module'

test.group('SystemModule — system_module_permission_enforcement_active', (group) => {
  const slug = `test-permission-enforcement-${Date.now()}`

  group.teardown(async () => {
    await SystemModule.query().where('system_module_slug', slug).delete()
  })

  test('nace apagado (false) por default', async ({ assert }) => {
    const systemModule = await SystemModule.create({
      systemModuleName: 'Test Permission Enforcement',
      systemModuleSlug: slug,
      systemModuleDescription: 'Fixture de test',
      systemModules: '1',
      systemModulePath: '/test-permission-enforcement',
      systemModuleGroup: 'test',
      systemModuleActive: 1,
      systemModuleIcon: '',
    })

    assert.isFalse(systemModule.systemModulePermissionEnforcementActive)

    const reloaded = await SystemModule.query()
      .where('system_module_id', systemModule.systemModuleId)
      .firstOrFail()
    assert.isFalse(reloaded.systemModulePermissionEnforcementActive)
  })

  test('se puede encender y persiste como boolean real (no 0/1 crudo)', async ({ assert }) => {
    const systemModule = await SystemModule.query().where('system_module_slug', slug).firstOrFail()
    systemModule.systemModulePermissionEnforcementActive = true
    await systemModule.save()

    const reloaded = await SystemModule.query()
      .where('system_module_id', systemModule.systemModuleId)
      .firstOrFail()
    assert.isTrue(reloaded.systemModulePermissionEnforcementActive)
    assert.isBoolean(reloaded.systemModulePermissionEnforcementActive)
  })
})
