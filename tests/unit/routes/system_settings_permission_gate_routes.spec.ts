import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

/**
 * Protección vigente de Ajustes Generales (`system-settings`) en el API: qué
 * ruta declara `permissionGate`, cuál queda abierta a propósito y qué rutas que
 * eran públicas exigen sesión. Las lecturas abiertas las consumen otras
 * pantallas o la PWA; si alguien les pone gate, esas pantallas responden 403
 * aunque el rol no tenga nada que ver con administrar ajustes.
 */

type DeclarationName = keyof typeof SYSTEM_SETTINGS_PERMISSION_DECLARATIONS

interface RouteRef {
  method: 'get' | 'post' | 'put' | 'delete'
  path: string
  handler: string
}

interface GatedRouteRef extends RouteRef {
  declaration: DeclarationName
}

const readRoutes = (fileName: string) =>
  readFileSync(join(process.cwd(), 'start/routes', fileName), 'utf-8')

/** Sin espacios ni saltos, para no depender del formato de la cadena. */
const compact = (content: string) => content.replace(/\s+/g, '')

/**
 * Middleware encadenado a una ruta: desde su declaración hasta la siguiente
 * ruta o el cierre del grupo. Así el caso no depende del formato ni de si la
 * ruta monta también `auth()` o `businessScope()`.
 */
function routeChain(assert: Assert, content: string, route: RouteRef): string {
  const flat = compact(content)
  const head = compact(`router.${route.method}('${route.path}', '#controllers/${route.handler}')`)
  const index = flat.indexOf(head)

  assert.isAbove(index, -1, `${route.method.toUpperCase()} ${route.path} debe existir`)

  const rest = flat.slice(index + head.length)
  const end = rest.search(/router\.(get|post|put|patch|delete)\(|\}\)\.prefix\(/)
  return end === -1 ? rest : rest.slice(0, end)
}

const GATE_CALL = 'middleware.permissionGate('

/** La ruta declara exactamente su gate: uno solo, el esperado. */
function assertGated(assert: Assert, content: string, route: GatedRouteRef): string {
  const chain = routeChain(assert, content, route)
  const label = `${route.method.toUpperCase()} ${route.path}`

  assert.include(
    chain,
    `.use(${GATE_CALL}SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.${route.declaration}))`,
    `${label} debe declarar ${route.declaration}`
  )
  assert.equal(chain.split(GATE_CALL).length - 1, 1, `${label} debe tener un solo permissionGate`)
  return chain
}

function assertOpen(assert: Assert, content: string, route: RouteRef): void {
  assert.notInclude(
    routeChain(assert, content, route),
    GATE_CALL,
    `${route.method.toUpperCase()} ${route.path} debe quedar sin gate`
  )
}

/** El gate lee `ctx.auth.user`: `auth()` tiene que ir antes en la misma cadena. */
function assertAuthBeforeGate(assert: Assert, chain: string, label: string): void {
  const authIndex = chain.indexOf('.use(middleware.auth())')
  assert.isAbove(authIndex, -1, `${label} debe montar auth()`)
  assert.isBelow(authIndex, chain.indexOf(GATE_CALL), `${label}: auth() debe ir antes del gate`)
}

test.group('Ajustes Generales — declaraciones del gate', () => {
  test('todas apuntan a system-settings con bypass standard y el verbo que les toca', ({
    assert,
  }) => {
    const reads: DeclarationName[] = [
      'indexSystemSettings',
      'showSystemSetting',
      'showProceedingFile',
      'showPayrollConfig',
      'indexNotificationEmails',
      'indexNotificationEmailsBySystemSetting',
      'indexEmployeeLimits',
      'showActiveEmployeeLimit',
      'indexTradeNames',
      'showTradeName',
    ]
    const expectedAction = (name: DeclarationName) => {
      if (name === 'storeSystemSetting') return 'create'
      if (name === 'destroySystemSetting') return 'delete'
      return reads.includes(name) ? 'read' : 'update'
    }

    for (const [name, declaration] of Object.entries(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS)) {
      const key = name as DeclarationName
      assert.equal(declaration.module, 'system-settings', `${key}: módulo`)
      assert.equal(declaration.bypass, 'standard', `${key}: bypass`)
      assert.equal(declaration.action, expectedAction(key), `${key}: acción`)
    }
  })
})

test.group('Ajustes Generales — start/routes/system_setting_routes.ts', () => {
  test('la ficha y sus interruptores montan auth, businessScope y su gate, en ese orden', ({
    assert,
  }) => {
    const content = readRoutes('system_setting_routes.ts')
    const handler = (method: string) => `system_setting_controller.${method}`
    const routes: GatedRouteRef[] = [
      { method: 'put', path: '/:systemSettingId/birthday-emails', handler: handler('updateBirthdayEmailsStatus'), declaration: 'updateBirthdayEmailsStatus' },
      { method: 'put', path: '/:systemSettingId/anniversary-emails', handler: handler('updateAnniversaryEmailsStatus'), declaration: 'updateAnniversaryEmailsStatus' },
      { method: 'put', path: '/:systemSettingId/attendance-fault-hr-emails', handler: handler('updateAttendanceFaultHrEmailsStatus'), declaration: 'updateAttendanceFaultHrEmailsStatus' },
      { method: 'post', path: '/:systemSettingId/employee-application-icon', handler: handler('uploadEmployeeApplicationIcon'), declaration: 'uploadEmployeeApplicationIcon' },
      { method: 'get', path: '/', handler: handler('index'), declaration: 'indexSystemSettings' },
      { method: 'post', path: '/', handler: handler('store'), declaration: 'storeSystemSetting' },
      { method: 'put', path: '/:systemSettingId', handler: handler('update'), declaration: 'updateSystemSetting' },
      { method: 'delete', path: '/:systemSettingId', handler: handler('delete'), declaration: 'destroySystemSetting' },
      { method: 'get', path: '/:systemSettingId', handler: handler('show'), declaration: 'showSystemSetting' },
    ]

    for (const route of routes) {
      const chain = assertGated(assert, content, route)
      const label = `${route.method.toUpperCase()} ${route.path}`
      assertAuthBeforeGate(assert, chain, label)
      assert.isBelow(
        chain.indexOf('.use(middleware.businessScope())'),
        chain.indexOf(GATE_CALL),
        `${label}: businessScope() debe ir antes del gate`
      )
    }
  })

  test('la configuración activa y la de nómina quedan con sesión y sin gate', ({ assert }) => {
    const content = readRoutes('system_setting_routes.ts')

    for (const handler of ['getActive', 'getPayrollConfig']) {
      const route: RouteRef = { method: 'get', path: '/', handler: `system_setting_controller.${handler}` }
      assertOpen(assert, content, route)
      assert.include(routeChain(assert, content, route), '.use(middleware.auth())')
    }
  })
})

test.group('Ajustes Generales — subrecursos de la ficha', () => {
  test('expediente de la empresa: escrituras y detalle con gate; listado abierto; vencimientos con el gate de la matriz', ({
    assert,
  }) => {
    const content = readRoutes('system_settings_proceeding_files_routes.ts')
    const handler = (method: string) => `system_setting_controller.${method}`

    assertGated(assert, content, { method: 'post', path: '/', handler: handler('storeProceedingFile'), declaration: 'storeProceedingFile' })
    assertGated(assert, content, { method: 'put', path: '/:systemSettingProceedingFileId', handler: handler('updateProceedingFile'), declaration: 'updateProceedingFile' })
    assertGated(assert, content, { method: 'get', path: '/:systemSettingProceedingFileId', handler: handler('showProceedingFile'), declaration: 'showProceedingFile' })
    assertGated(assert, content, { method: 'delete', path: '/:systemSettingProceedingFileId', handler: handler('deleteProceedingFile'), declaration: 'destroyProceedingFile' })
    assertOpen(assert, content, { method: 'get', path: '/', handler: handler('proceedingFiles') })
    // Los vencimientos solo los lee la Matriz de vencimientos: los gobierna su módulo, no Ajustes Generales.
    const expiring = routeChain(assert, content, { method: 'get', path: '/get-expired-and-expiring/:systemSettingId', handler: handler('getExpiresAndExpiringProceedingFiles') })
    assert.include(expiring, `.use(${GATE_CALL}DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS.getExpiredAndExpiringSystemSettingProceedingFiles))`)
    assert.equal(expiring.split(GATE_CALL).length - 1, 1)
    assert.include(compact(content), ".prefix('/api/system-settings-proceeding-files').use(middleware.auth())")
  })

  test('tolerancias: escrituras con gate; lecturas abiertas y la ruta literal antes que la paramétrica', ({
    assert,
  }) => {
    const content = readRoutes('tolerance_routes.ts')
    const handler = (method: string) => `tolerances_controller.${method}`

    assertGated(assert, content, { method: 'post', path: '/', handler: handler('store'), declaration: 'storeTolerance' })
    assertGated(assert, content, { method: 'put', path: '/:id', handler: handler('update'), declaration: 'updateTolerance' })
    assertGated(assert, content, { method: 'delete', path: '/:id', handler: handler('destroy'), declaration: 'destroyTolerance' })
    assertOpen(assert, content, { method: 'get', path: '/:systemSettingId', handler: handler('index') })
    assertOpen(assert, content, { method: 'get', path: '/get-tardiness-tolerance', handler: handler('getTardinessTolerance') })
    assertOpen(assert, content, { method: 'get', path: '/:id', handler: handler('show') })

    // Un parámetro de ruta acepta cualquier segmento: registrada primero,
    // `/:systemSettingId` atendía también `/get-tardiness-tolerance` y el
    // Monitor de asistencia recibía el listado de una empresa con id
    // "get-tardiness-tolerance" en vez de su tolerancia de retardo.
    const flat = compact(content)
    assert.isBelow(
      flat.indexOf("router.get('/get-tardiness-tolerance'"),
      flat.indexOf("router.get('/:systemSettingId'"),
      'la ruta literal debe registrarse antes que la paramétrica'
    )
    assert.include(compact(content), ".prefix('/api/tolerances').use(middleware.auth())")
  })

  /**
   * Mismo criterio que el límite de empleados: `auth()` en el GRUPO y antes que
   * `businessScope()`. El detalle de esta configuración además era público antes
   * de que el grupo llevara autenticación.
   */
  test('configuración de nómina: el grupo monta auth antes del scope y cada ruta su gate', ({
    assert,
  }) => {
    const content = readRoutes('system_setting_payroll_config_routes.ts')
    const handler = (method: string) => `system_setting_payroll_config_controller.${method}`
    const routes: GatedRouteRef[] = [
      { method: 'post', path: '/', handler: handler('store'), declaration: 'storePayrollConfig' },
      { method: 'put', path: '/:systemSettingPayrollConfigId', handler: handler('update'), declaration: 'updatePayrollConfig' },
      { method: 'delete', path: '/:systemSettingPayrollConfigId', handler: handler('delete'), declaration: 'destroyPayrollConfig' },
      { method: 'get', path: '/:systemSettingPayrollConfigId', handler: handler('show'), declaration: 'showPayrollConfig' },
    ]

    for (const route of routes) {
      assertGated(assert, content, route)
    }

    const flat = compact(content)
    assert.include(flat, ".prefix('/api/system-setting-payroll-configs')")
    assert.isBelow(
      flat.indexOf('.use(middleware.auth())'),
      flat.indexOf('.use(middleware.businessScope())'),
      'auth() del grupo debe ir antes de businessScope()'
    )
  })

  test('correos de notificación: el grupo monta auth y cada ruta su gate (no tenía ningún middleware)', ({
    assert,
  }) => {
    const content = readRoutes('system_settings_notification_emails_routes.ts')
    const handler = (method: string) => `system_settings_notification_emails_controller.${method}`

    assertGated(assert, content, { method: 'get', path: '/', handler: handler('index'), declaration: 'indexNotificationEmails' })
    assertGated(assert, content, { method: 'get', path: '/:systemSettingId', handler: handler('indexBySystemSetting'), declaration: 'indexNotificationEmailsBySystemSetting' })
    assertGated(assert, content, { method: 'post', path: '/', handler: handler('store'), declaration: 'storeNotificationEmail' })
    assertGated(assert, content, { method: 'delete', path: '/:systemSettingNotificationEmailId', handler: handler('delete'), declaration: 'destroyNotificationEmail' })
    const flat = compact(content)
    assert.include(flat, ".prefix('/api/system-settings-notification-emails').use(middleware.auth())")
    assert.include(flat, '.use(middleware.businessScope())')
  })

  /**
   * `auth()` vive en el GRUPO, como en el resto de los grupos de este archivo, y
   * antes que `businessScope()`. Antes estaba ruta por ruta, y como los
   * middlewares del grupo corren primero, `businessScope()` se ejecutaba sin
   * usuario autenticado y reventaba con un 500 al leer su rol.
   */
  test('límite de empleados: el grupo monta auth antes del scope y cada ruta su gate', ({
    assert,
  }) => {
    const content = readRoutes('system_settings_employees.ts')
    const handler = (method: string) => `system_settings_employees_controller.${method}`
    const routes: GatedRouteRef[] = [
      { method: 'post', path: '/', handler: handler('store'), declaration: 'storeEmployeeLimit' },
      { method: 'get', path: '/:systemSettingId', handler: handler('index'), declaration: 'indexEmployeeLimits' },
      { method: 'get', path: '/:systemSettingId/active', handler: handler('getActive'), declaration: 'showActiveEmployeeLimit' },
      { method: 'delete', path: '/:systemSettingId', handler: handler('delete'), declaration: 'destroyEmployeeLimit' },
    ]

    for (const route of routes) {
      assertGated(assert, content, route)
    }

    const flat = compact(content)
    assert.include(flat, ".prefix('/api/system-settings-employees')")
    assert.isBelow(
      flat.indexOf('.use(middleware.auth())'),
      flat.indexOf('.use(middleware.businessScope())'),
      'auth() del grupo debe ir antes de businessScope()'
    )
  })

  test('razones sociales: cada ruta declara su gate y el grupo conserva auth y businessScope', ({
    assert,
  }) => {
    const content = readRoutes('system_setting_trade_name_routes.ts')
    const handler = (method: string) => `system_setting_trade_name_controller.${method}`

    assertGated(assert, content, { method: 'get', path: '/', handler: handler('index'), declaration: 'indexTradeNames' })
    assertGated(assert, content, { method: 'post', path: '/', handler: handler('store'), declaration: 'storeTradeName' })
    assertGated(assert, content, { method: 'post', path: '/:systemSettingTradeNameId/employee-application-icon', handler: handler('uploadEmployeeApplicationIcon'), declaration: 'uploadTradeNameEmployeeApplicationIcon' })
    assertGated(assert, content, { method: 'put', path: '/:systemSettingTradeNameId', handler: handler('update'), declaration: 'updateTradeName' })
    assertGated(assert, content, { method: 'delete', path: '/:systemSettingTradeNameId', handler: handler('delete'), declaration: 'destroyTradeName' })
    assertGated(assert, content, { method: 'get', path: '/:systemSettingTradeNameId', handler: handler('show'), declaration: 'showTradeName' })

    const flat = compact(content)
    assert.include(flat, ".prefix('/api/system-setting-trade-names').use(middleware.auth())")
    assert.include(flat, '.use(middleware.businessScope())')
  })
})
