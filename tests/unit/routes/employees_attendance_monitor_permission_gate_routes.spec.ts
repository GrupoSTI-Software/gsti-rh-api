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
 *    llamarlos. Exigen `delete-check-assist` y `sync-assist`.
 *  - La sincronización general (`POST /synchronize`) verificaba `sync-assist`
 *    en su controller con `RoleService.hasAccess` y respondía `AST.AUTHZ.003`:
 *    dos piezas de control de acceso para la misma decisión, con dos formas de
 *    negativa. Ahora también pasa por el gate y responde `PERM.DENIED`.
 */

const MONITOR = 'EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS'
const ROUTES_FILE = 'start/routes/assist_routes.ts'
const CONTROLLER = '#controllers/assists_controller'

const monitorGate = (key: keyof typeof EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS) =>
  gateExpression(MONITOR, EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS, key)

test.group('Monitor de asistencia — declaraciones y exigencia', () => {
  test('las dos sincronizaciones piden sync-assist y anular una checada pide delete-check-assist; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({
      module: 'employees-attendance-monitor',
      action,
      bypass: 'standard',
    })

    assert.deepEqual(EMPLOYEES_ATTENDANCE_MONITOR_PERMISSION_DECLARATIONS, {
      synchronizeAssists: standard('sync-assist'),
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
  test('las dos sincronizaciones e inactivate declaran su gate', ({ assert }) => {
    const content = readSource(ROUTES_FILE)

    assertRouteGated(assert, content, {
      method: 'post',
      path: '/synchronize',
      handler: `${CONTROLLER}.synchronize`,
      gate: monitorGate('synchronizeAssists'),
    })
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

  test('el controller ya no verifica sync-assist por su cuenta ni emite AST.AUTHZ.003', ({
    assert,
  }) => {
    // Dejar la verificación del controller junto al gate sería doble control de
    // acceso para la misma decisión: es lo que producía las dos negativas.
    const controller = readSource('app/controllers/assists_controller.ts')

    assert.notInclude(controller, 'assertCanSyncAssist')
    assert.notInclude(
      controller,
      "roleService.hasAccess(userRoleId, ATTENDANCE_MONITOR_MODULE_SLUG, 'sync-assist')"
    )
    assert.notInclude(controller, 'ASSIST_ERROR_CODES.AUTHZ_SYNC')
  })

  test('la captura de checadas sigue sin gate de ruta: la resuelve el propio controller', ({
    assert,
  }) => {
    // Sirve de testigo de que `assertRouteOpen` sigue distinguiendo una ruta sin
    // gate; sin él, el caso de arriba pasaría aunque el helper dejara de ver los
    // gates.
    assertRouteOpen(assert, readSource(ROUTES_FILE), {
      method: 'post',
      path: '/',
      handler: `${CONTROLLER}.store`,
    })
  })
})
