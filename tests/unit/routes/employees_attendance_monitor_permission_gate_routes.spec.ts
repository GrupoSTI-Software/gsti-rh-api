import { test } from '@japa/runner'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import { EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS } from '#constants/employees_attendance_monitor_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Protección vigente en el API del Monitor de asistencia.
 *
 *  - Anular una checada (`PUT /:assistId/inactivate`) y sincronizar por
 *    empleado (`POST /employee-synchronize`) no verificaban nada: el panel de
 *    asistencia ocultaba el botón, pero cualquier sesión del tenant podía
 *    llamarlos. Ahora exigen `delete-check-assist` y `sync-assist`.
 *  - La sincronización general (`POST /synchronize`) sigue sin gate de ruta:
 *    su controller ya exige `sync-assist` y responde con `AST.AUTHZ.003`.
 */

const MONITOR = 'EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS'
const ROUTES_FILE = 'start/routes/assist_routes.ts'
const CONTROLLER = '#controllers/assists_controller'

const monitorGate = (key: keyof typeof EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS) =>
  gateExpression(MONITOR, EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS, key)

test.group('Monitor de asistencia — declaraciones y exigencia', () => {
  test('sincronizar por empleado pide sync-assist y anular una checada pide delete-check-assist; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({
      module: 'employees-attendance-monitor',
      action,
      bypass: 'standard',
    })

    assert.deepEqual(EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS, {
      employeeSynchronizeAssists: standard('sync-assist'),
      inactivateAssist: standard('delete-check-assist'),
    })
  })

  test('el módulo tiene la exigencia encendida y declara las dos casillas que verifica el gate', ({
    assert,
  }) => {
    // Con la exigencia apagada el gate deja pasar a cualquier sesión.
    const monitor = SYSTEM_MODULES.find(
      (systemModule) => systemModule.systemModuleSlug === 'employees-attendance-monitor'
    )
    assert.isTrue(monitor?.systemModulePermissionEnforcementActive)

    const declared = (monitor?.systemModulePermissions ?? []).map(
      (permission) => permission.systemPermissionSlug
    )
    assert.includeMembers(declared, ['sync-assist', 'delete-check-assist'])
  })
})

test.group('assist_routes — gates del Monitor de asistencia', () => {
  test('employee-synchronize e inactivate declaran su gate', ({ assert }) => {
    const content = readSource(ROUTES_FILE)

    assertRouteGated(assert, content, {
      method: 'post',
      path: '/employee-synchronize',
      handler: `${CONTROLLER}.employeeSynchronize`,
      gate: monitorGate('employeeSynchronizeAssists'),
    })
    assertRouteGated(assert, content, {
      method: 'put',
      path: '/:assistId/inactivate',
      handler: `${CONTROLLER}.inactivate`,
      gate: monitorGate('inactivateAssist'),
    })
  })

  test('synchronize sigue sin gate de ruta porque su controller exige sync-assist', ({ assert }) => {
    assertRouteOpen(assert, readSource(ROUTES_FILE), {
      method: 'post',
      path: '/synchronize',
      handler: `${CONTROLLER}.synchronize`,
    })

    const controller = readSource('app/controllers/assists_controller.ts')
    assert.include(
      controller,
      "roleService.hasAccess(userRoleId, ATTENDANCE_MONITOR_MODULE_SLUG, 'sync-assist')"
    )
    assert.include(controller, 'if (!userRoleId || !(await this.assertCanSyncAssist(userRoleId)))')
  })
})
