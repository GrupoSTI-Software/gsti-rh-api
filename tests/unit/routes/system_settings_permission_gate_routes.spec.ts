import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('system_setting_routes — PermissionGate', () => {
  test('las 9 rutas declaran el gate de la acción correcta', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/system_setting_routes.ts'),
      'utf8'
    )
    const compacted = compact(content)

    assert.include(
      compacted,
      "put('/:systemSettingId/birthday-emails','#controllers/system_setting_controller.updateBirthdayEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateBirthdayEmailsStatus))"
    )
    assert.include(
      compacted,
      "put('/:systemSettingId/anniversary-emails','#controllers/system_setting_controller.updateAnniversaryEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateAnniversaryEmailsStatus))"
    )
    assert.include(
      compacted,
      "put('/:systemSettingId/attendance-fault-hr-emails','#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateAttendanceFaultHrEmailsStatus))"
    )
    assert.include(
      compacted,
      "post('/:systemSettingId/employee-application-icon','#controllers/system_setting_controller.uploadEmployeeApplicationIcon').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeApplicationIcon))"
    )
    assert.include(
      compacted,
      "get('/','#controllers/system_setting_controller.index').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS.index))"
    )
    assert.include(
      compacted,
      "post('/','#controllers/system_setting_controller.store').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.store))"
    )
    assert.include(
      compacted,
      "put('/:systemSettingId','#controllers/system_setting_controller.update').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.update))"
    )
    assert.include(
      compacted,
      "delete('/:systemSettingId','#controllers/system_setting_controller.delete').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_DELETE_PERMISSION_DECLARATIONS.delete))"
    )
    assert.include(
      compacted,
      "get('/:systemSettingId','#controllers/system_setting_controller.show').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS.show))"
    )

    const gates = compacted.match(/permissionGate\(SYSTEM_SETTINGS_[\w.]+\)/g) ?? []
    assert.equal(gates.length, 9, 'exactamente 9 gates, uno por ruta')
  })
})
