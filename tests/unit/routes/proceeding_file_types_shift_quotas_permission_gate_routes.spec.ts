import { test } from '@japa/runner'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'
import { BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS } from '#constants/branch_office_shift_quotas_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Dos rutas que solo tenían `auth` y `businessScope`, protegidas por el módulo
 * de la pantalla que las usa:
 *
 *  - Carpetas del expediente (`/api/proceeding-file-types`). Su módulo propio
 *    está retirado y sin permisos. El alta de carpeta de colaborador la
 *    gobierna Empleados y la de la empresa, Ajustes Generales. La edición y la
 *    baja comparten ruta entre las dos áreas: las decide el controller.
 *  - Cuotas de plantilla (`/api/branch-offices/:id/shift-quotas`). La escritura
 *    la gobierna REPSE, que es su única pantalla. La lectura tiene dos
 *    consumidores de módulos distintos y por eso tampoco lleva gate de ruta.
 */

const PFT_ROUTES = 'start/routes/proceeding_file_type_routes.ts'
const PFT_CONTROLLER = '#controllers/proceeding_file_type_controller'
const QUOTA_ROUTES = 'start/routes/branch_office_shift_quota_routes.ts'
const QUOTA_CONTROLLER = '#controllers/branch_office_shift_quotas_controller'
const QUOTA_PATH = '/branch-offices/:branchOfficeId/shift-quotas'

test.group('proceeding_file_type_routes — altas con gate, edición y baja por área', () => {
  test('cada alta declara el gate del módulo que la dispara', ({ assert }) => {
    const content = readSource(PFT_ROUTES)

    assertRouteGated(assert, content, {
      method: 'post',
      path: '/create-employee-type',
      handler: `${PFT_CONTROLLER}.createEmployeeType`,
      gate: gateExpression(
        'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS',
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
        'createEmployeeProceedingFileType'
      ),
    })
    assertRouteGated(assert, content, {
      method: 'post',
      path: '/create-system-setting-type',
      handler: `${PFT_CONTROLLER}.createSystemSettingType`,
      gate: gateExpression(
        'SYSTEM_SETTINGS_PERMISSION_DECLARATIONS',
        SYSTEM_SETTINGS_PERMISSION_DECLARATIONS,
        'storeSystemSettingProceedingFileType'
      ),
    })
  })

  test('el alta de carpeta de colaborador pide tab-expediente-write y la de empresa, update', ({
    assert,
  }) => {
    assert.deepEqual(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFileType, {
      module: 'employees',
      action: 'tab-expediente-write',
      bypass: 'standard',
    })
    assert.deepEqual(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeSystemSettingProceedingFileType, {
      module: 'system-settings',
      action: 'update',
      bypass: 'standard',
    })
  })

  test('alta genérica, edición y baja no llevan gate de ruta: sirven a las dos áreas', ({
    assert,
  }) => {
    const content = readSource(PFT_ROUTES)

    for (const route of [
      { method: 'post', path: '/', handler: `${PFT_CONTROLLER}.store` },
      { method: 'put', path: '/:proceedingFileTypeId', handler: `${PFT_CONTROLLER}.update` },
      { method: 'delete', path: '/:proceedingFileTypeId', handler: `${PFT_CONTROLLER}.delete` },
    ] as const) {
      assertRouteOpen(assert, content, route)
    }
  })

  test('el controller exige el permiso del área antes de escribir o borrar', ({ assert }) => {
    // Sin esto, "sin gate de ruta" arriba sería indistinguible de "sin permiso".
    const controller = readSource('app/controllers/proceeding_file_type_controller.ts')

    assert.include(controller, 'ensureSecondaryPermission')
    assert.include(controller, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION')
    assert.include(controller, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION')
    assert.include(controller, 'SYSTEM_SETTINGS_PROCEEDING_FILE_TYPE_WRITE_PERMISSION')

    // En cada operación el permiso se resuelve ANTES de tocar el registro.
    for (const [method, serviceCall] of [
      ['async store(', 'proceedingFileTypeService.store('],
      ['async update(', 'proceedingFileTypeService.update('],
      ['async delete(', 'proceedingFileTypeService.delete('],
    ] as const) {
      const start = controller.indexOf(method)
      assert.isAbove(start, -1, `${method} debe existir`)
      const gate = controller.indexOf('ensureAreaPermission', start)
      const write = controller.indexOf(serviceCall, start)
      assert.isAbove(gate, -1, `${method} debe exigir el permiso del área`)
      assert.isBelow(gate, write, `${method} debe exigirlo antes de escribir`)
    }
  })
})

test.group('branch_office_shift_quota_routes — escritura con gate, lectura en el controller', () => {
  test('la escritura declara repse-registrations:gestion', ({ assert }) => {
    assertRouteGated(assert, readSource(QUOTA_ROUTES), {
      method: 'put',
      path: QUOTA_PATH,
      handler: `${QUOTA_CONTROLLER}.replace`,
      gate: gateExpression(
        'BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS',
        BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS,
        'replaceBranchOfficeShiftQuotas'
      ),
    })

    assert.deepEqual(BRANCH_OFFICE_SHIFT_QUOTAS_PERMISSION_DECLARATIONS, {
      replaceBranchOfficeShiftQuotas: {
        module: 'repse-registrations',
        action: 'gestion',
        bypass: 'expanded',
      },
    })
  })

  test('la lectura no lleva gate de ruta y la resuelve el controller con los dos módulos', ({
    assert,
  }) => {
    assertRouteOpen(assert, readSource(QUOTA_ROUTES), {
      method: 'get',
      path: QUOTA_PATH,
      handler: `${QUOTA_CONTROLLER}.index`,
    })

    const controller = readSource('app/controllers/branch_office_shift_quotas_controller.ts')
    assert.include(controller, 'BRANCH_OFFICE_SHIFT_QUOTAS_REPSE_READ_PERMISSION')
    assert.include(controller, 'createTemporaryAssignment')

    const start = controller.indexOf('async index(')
    const check = controller.indexOf('canReadShiftQuotas(ctx)', start)
    const list = controller.indexOf('BranchOfficeShiftQuotaService.list(', start)
    assert.isAbove(check, -1, 'index debe comprobar el permiso de lectura')
    assert.isBelow(check, list, 'debe comprobarlo antes de listar')
  })

  test('los dos módulos que gobiernan las cuotas tienen la exigencia encendida', ({ assert }) => {
    // Con la exigencia apagada el gate deja pasar a cualquier sesión y la
    // protección de arriba no serviría de nada.
    for (const slug of ['repse-registrations', 'employees', 'system-settings']) {
      const systemModule = SYSTEM_MODULES.find(
        (candidate) => candidate.systemModuleSlug === slug
      )
      assert.isTrue(
        systemModule?.systemModulePermissionEnforcementActive,
        `${slug} debe exigir permisos`
      )
    }
  })
})
