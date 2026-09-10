import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789018905972 — las cinco vías de escritura restantes montaban solo
 * `auth()`. Este test valida que todas exijan `businessScope()` obligatorio.
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/system_setting_routes.ts')

const WRITE_ROUTES = [
  {
    label: 'birthday-emails',
    snippet:
      "router.put('/:systemSettingId/birthday-emails', '#controllers/system_setting_controller.updateBirthdayEmailsStatus').use(middleware.auth()).use(middleware.businessScope())",
  },
  {
    label: 'anniversary-emails',
    snippet:
      "router.put('/:systemSettingId/anniversary-emails', '#controllers/system_setting_controller.updateAnniversaryEmailsStatus').use(middleware.auth()).use(middleware.businessScope())",
  },
  {
    label: 'attendance-fault-hr-emails',
    snippet:
      "router.put('/:systemSettingId/attendance-fault-hr-emails', '#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus').use(middleware.auth()).use(middleware.businessScope())",
  },
  {
    label: 'employee-application-icon',
    snippet:
      "router.post('/:systemSettingId/employee-application-icon', '#controllers/system_setting_controller.uploadEmployeeApplicationIcon').use(middleware.auth()).use(middleware.businessScope())",
  },
  {
    label: 'delete',
    snippet:
      "router.delete('/:systemSettingId', '#controllers/system_setting_controller.delete').use(middleware.auth()).use(middleware.businessScope())",
  },
] as const

test.group('SystemSetting write — rutas con scope obligatorio (CA-8)', () => {
  test('las cinco vías montan auth() y businessScope() en ese orden', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "prefix('/api/system-settings')")

    for (const route of WRITE_ROUTES) {
      assert.include(content, route.snippet, `Falta scope en ${route.label}`)
    }
  })

  test('los cinco manejadores siguen apuntando a los mismos métodos', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "'#controllers/system_setting_controller.updateBirthdayEmailsStatus'")
    assert.include(content, "'#controllers/system_setting_controller.updateAnniversaryEmailsStatus'")
    assert.include(content, "'#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus'")
    assert.include(content, "'#controllers/system_setting_controller.uploadEmployeeApplicationIcon'")
    assert.include(content, "'#controllers/system_setting_controller.delete'")
  })
})
