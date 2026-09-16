import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { CALENDAR_PERMISSION_DECLARATIONS } from '#constants/calendar_permission_declarations'
import { DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS } from '#constants/documents_expiration_matrix_permission_declarations'
import { EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS } from '#constants/employee_lactation_periods_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  compactSource,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Protección vigente en el API de Calendario, Matriz de vencimientos, Bitácora
 * de lactancia y la lectura de solicitudes de permisos no leídas: qué ruta
 * declara `permissionGate`, con qué declaración, y cuál queda abierta a
 * propósito.
 *
 * Las abiertas las consume otra app o pantalla: la PWA del colaborador (lista
 * de festividades, alta de solicitudes D-08, mis solicitudes) y los cálculos de
 * asistencia y nómina del backoffice. Si alguien les pone gate, esos
 * consumidores responden 403 a roles que no administran el módulo.
 */

const CALENDAR = 'CALENDAR_PERMISSION_DECLARATIONS'
const MATRIX = 'DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS'
const LACTATION = 'EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS'
const EMPLOYEES_READ = 'EMPLOYEES_READ_PERMISSION_DECLARATIONS'

/**
 * Cuerpo de un método de controller: desde su firma hasta el siguiente método,
 * helper privado o bloque de documentación.
 */
function methodSource(assert: Assert, source: string, name: string): string {
  const start = source.indexOf(`\n  async ${name}(`)
  assert.isAbove(start, -1, `${name} debe existir`)

  const rest = source.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}(async |private |\/\*\*)/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

test.group('Calendario, matriz y lactancia — declaraciones del gate', () => {
  test('calendar: detalle y exportación piden read; escrituras su verbo; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({ module: 'calendar', action, bypass: 'standard' })

    assert.deepEqual(CALENDAR_PERMISSION_DECLARATIONS, {
      storeHoliday: standard('create'),
      showHoliday: standard('read'),
      exportHolidaysExcel: standard('read'),
      updateHoliday: standard('update'),
      destroyHoliday: standard('delete'),
    })
  })

  test('documents-expiration-matrix y employee-lactation-periods: solo read con bypass standard', ({
    assert,
  }) => {
    const read = (module: string) => ({ module, action: 'read', bypass: 'standard' })

    assert.deepEqual(DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS, {
      getExpiredAndExpiringSystemSettingProceedingFiles: read('documents-expiration-matrix'),
      getExpiredAndExpiringRepseRegistrations: read('documents-expiration-matrix'),
    })
    assert.deepEqual(EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS, {
      complianceReport: read('employee-lactation-periods'),
      complianceReportExport: read('employee-lactation-periods'),
    })
  })

  test('employees: no leídas y descarga de evidencias cuelgan de su pestaña; el reporte ya no es de employees', ({
    assert,
  }) => {
    assert.deepEqual(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexUnreadExceptionRequests, {
      module: 'employees',
      action: 'tab-trabajo-read',
      bypass: 'standard',
    })
    assert.deepEqual(EMPLOYEES_READ_PERMISSION_DECLARATIONS.downloadLactationEvidence, {
      module: 'employees',
      action: 'tab-periodos-lactancia-read',
      bypass: 'standard',
    })
    assert.notProperty(EMPLOYEES_READ_PERMISSION_DECLARATIONS, 'lactationComplianceReport')
  })
})

test.group('Calendario — start/routes/holiday_routes.ts', () => {
  const handler = (method: string) => `#controllers/holidays_controller.${method}`

  test('detalle, exportación y escrituras declaran su gate; lista e iconos quedan abiertos', ({
    assert,
  }) => {
    const content = readSource('start/routes/holiday_routes.ts')
    const decl = (key: keyof typeof CALENDAR_PERMISSION_DECLARATIONS) =>
      gateExpression(CALENDAR, CALENDAR_PERMISSION_DECLARATIONS, key)

    assertRouteGated(assert, content, { method: 'post', path: '/holidays', handler: handler('store'), gate: decl('storeHoliday') })
    assertRouteGated(assert, content, { method: 'get', path: '/holidays/export-excel', handler: handler('exportExcel'), gate: decl('exportHolidaysExcel') })
    assertRouteGated(assert, content, { method: 'get', path: '/holidays/:id', handler: handler('show'), gate: decl('showHoliday') })
    assertRouteGated(assert, content, { method: 'put', path: '/holidays/:id', handler: handler('update'), gate: decl('updateHoliday') })
    assertRouteGated(assert, content, { method: 'delete', path: '/holidays/:id', handler: handler('destroy'), gate: decl('destroyHoliday') })

    assertRouteOpen(assert, content, { method: 'get', path: '/holidays', handler: handler('index') })
    assertRouteOpen(assert, content, { method: 'get', path: '/icons', handler: '#controllers/icons_controller.index' })

    // "export-excel" debe registrarse antes de `/:id` o se leería como identificador.
    const flat = compactSource(content)
    assert.isBelow(flat.indexOf("'/holidays/export-excel'"), flat.indexOf("'/holidays/:id'"))
  })
})

test.group('Solicitudes de permisos — start/routes/exception_request_routes.ts', () => {
  const handler = (method: string) => `#controllers/exception_requests_controller.${method}`

  test('no leídas declara el mismo permiso de Empleados que /all; alta, mis solicitudes y detalle sin gate de ruta', ({
    assert,
  }) => {
    const content = readSource('start/routes/exception_request_routes.ts')
    const decl = (key: keyof typeof EMPLOYEES_READ_PERMISSION_DECLARATIONS) =>
      gateExpression(EMPLOYEES_READ, EMPLOYEES_READ_PERMISSION_DECLARATIONS, key)

    assertRouteGated(assert, content, { method: 'get', path: '/unread', handler: handler('getUnreadExceptionRequests'), gate: decl('indexUnreadExceptionRequests') })
    assertRouteGated(assert, content, { method: 'get', path: '/all', handler: handler('indexAllExceptionRequests'), gate: decl('indexAllExceptionRequests') })

    // D-08 (alta desde la PWA), autoalcance del colaborador y detalle con
    // `ensureEmployeeTabRead` en el controller.
    assertRouteOpen(assert, content, { method: 'post', path: '/', handler: handler('store') })
    assertRouteOpen(assert, content, { method: 'get', path: '/my-requests', handler: handler('getMyExceptionRequests') })
    assertRouteOpen(assert, content, { method: 'get', path: '/:id', handler: handler('show') })
  })
})

test.group('Matriz de vencimientos — vencimientos de la empresa y del folio REPSE', () => {
  test('los dos vencimientos exclusivos de la matriz declaran documents-expiration-matrix:read', ({
    assert,
  }) => {
    const decl = (key: keyof typeof DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS) =>
      gateExpression(MATRIX, DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS, key)

    assertRouteGated(assert, readSource('start/routes/system_settings_proceeding_files_routes.ts'), {
      method: 'get',
      path: '/get-expired-and-expiring/:systemSettingId',
      handler: '#controllers/system_setting_controller.getExpiresAndExpiringProceedingFiles',
      gate: decl('getExpiredAndExpiringSystemSettingProceedingFiles'),
    })
    assertRouteGated(assert, readSource('start/routes/repse_registration_routes.ts'), {
      method: 'get',
      path: '/repse-registrations/get-expired-and-expiring',
      handler: '#controllers/repse_registrations_controller.getExpiredAndExpiring',
      gate: decl('getExpiredAndExpiringRepseRegistrations'),
    })
  })
})

test.group('Bitácora de lactancia — reporte de cumplimiento y descarga de evidencias', () => {
  test('el reporte y su PDF exigen la bitácora; la descarga de evidencias, la pestaña de lactancia', ({
    assert,
  }) => {
    const content = readSource('start/routes/employee_lactation_periods_routes.ts')
    const periods = (method: string) => `#controllers/employee_lactation_periods_controller.${method}`

    assertRouteGated(assert, content, {
      method: 'get',
      path: '/employee-lactation-periods/compliance-report',
      handler: periods('complianceReport'),
      gate: gateExpression(LACTATION, EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS, 'complianceReport'),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/employee-lactation-periods/compliance-report/export',
      handler: periods('complianceReportExport'),
      gate: gateExpression(LACTATION, EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS, 'complianceReportExport'),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/employee-lactation-periods/:periodId/evidences/:evidenceId/download-url',
      handler: '#controllers/employee_lactation_period_evidences_controller.downloadUrl',
      gate: gateExpression(EMPLOYEES_READ, EMPLOYEES_READ_PERMISSION_DECLARATIONS, 'downloadLactationEvidence'),
    })
  })

  test('esos tres métodos ya no repiten la verificación contra employees; el resto conserva la suya', ({
    assert,
  }) => {
    // Con `assertHasPermission` el controller seguía pidiendo `employees:read`
    // y el gate de la bitácora no alcanzaba para abrir el reporte.
    // Se busca la llamada, no el nombre: un comentario que la mencione no verifica nada.
    const legacyCheck = 'this.assertHasPermission('
    const periods = readSource('app/controllers/employee_lactation_periods_controller.ts')
    const evidences = readSource('app/controllers/employee_lactation_period_evidences_controller.ts')

    for (const name of ['complianceReport', 'complianceReportExport']) {
      assert.notInclude(methodSource(assert, periods, name), legacyCheck, name)
    }
    assert.notInclude(methodSource(assert, evidences, 'downloadUrl'), legacyCheck)

    // Fuera de alcance: la limpieza de la doble verificación en el resto va aparte.
    assert.include(methodSource(assert, periods, 'index'), legacyCheck)
    assert.include(methodSource(assert, evidences, 'index'), legacyCheck)
  })
})
