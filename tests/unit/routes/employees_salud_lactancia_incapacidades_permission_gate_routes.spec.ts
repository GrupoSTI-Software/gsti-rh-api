import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

type RouteMethod = 'get' | 'post' | 'put' | 'delete'

/**
 * Middleware encadenado a una ruta cuyo handler es un método de instancia
 * (`controller.metodo`, sin comillas): desde su declaración hasta la siguiente
 * ruta o el cierre del grupo. `route_gate_assertions` solo reconoce handlers en
 * texto (`'#controllers/x.metodo'`), que estas rutas no usan.
 */
function instanceRouteChain(
  assert: Assert,
  content: string,
  method: RouteMethod,
  path: string,
  handler: string
): string {
  const flat = compact(content)
  const head = `router.${method}('${path}',${handler})`
  const index = flat.indexOf(head)
  assert.isAbove(index, -1, `${method.toUpperCase()} ${path} debe existir`)

  const rest = flat.slice(index + head.length)
  const end = rest.search(/router\.(get|post|put|patch|delete)\(|\}\)\.prefix\(/)
  return end === -1 ? rest : rest.slice(0, end)
}

function assertInstanceRouteGated(
  assert: Assert,
  content: string,
  route: { method: RouteMethod; path: string; handler: string; gate: string }
): void {
  const chain = instanceRouteChain(assert, content, route.method, route.path, route.handler)
  const label = `${route.method.toUpperCase()} ${route.path}`
  assert.include(chain, `.use(middleware.permissionGate(${route.gate}))`, `${label} debe declarar ${route.gate}`)
  assert.equal(chain.split('permissionGate(').length - 1, 1, `${label} debe tener un solo permissionGate`)
}

test.group('employee_medical_condition_routes — PermissionGate', () => {
  test('escrituras y lecturas del expediente declaran permissionGate; la consulta del colaborador no', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_medical_condition_routes.ts'),
      'utf8'
    )
    const handler = (method: string) => `employeeMedicalConditionController.${method}`
    const gated = [
      { method: 'get', path: '/', handler: handler('index'), gate: 'EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployeeMedicalConditions' },
      { method: 'post', path: '/', handler: handler('store'), gate: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition' },
      { method: 'get', path: '/:employeeMedicalConditionId', handler: handler('show'), gate: 'EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeMedicalCondition' },
      { method: 'put', path: '/:employeeMedicalConditionId', handler: handler('update'), gate: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition' },
      { method: 'delete', path: '/:employeeMedicalConditionId', handler: handler('delete'), gate: 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition' },
    ] as const
    for (const route of gated) {
      assertInstanceRouteGated(assert, content, route)
    }

    // La consulta por colaborador la usa también la PWA para el perfil propio:
    // su regla vive en el controller, no en un gate de ruta. El regex anterior
    // (`getByEmployee` seguido de `permissionGate` en 200 caracteres) tomaba el
    // gate de la ruta siguiente y fallaba sin que hubiera cambio.
    assert.notInclude(
      instanceRouteChain(assert, content, 'get', '/employee/:employeeId', handler('getByEmployee')),
      'permissionGate('
    )
  })
})

test.group('employee_lactation_periods_routes — PermissionGate', () => {
  test('las 10 escrituras y las lecturas del reporte, conflictos y descarga declaran su gate', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_lactation_periods_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    const keys = [
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
    ]
    for (const key of keys) {
      assert.include(
        compact(content),
        `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      )
    }
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 10)
    // Las lecturas también llevan gate: el reporte y su PDF son de la Bitácora
    // de lactancia; conflictos y descarga de evidencias, de la pestaña de
    // lactancia de Empleados.
    for (const gate of [
      'EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS.complianceReport',
      'EMPLOYEE_LACTATION_PERIODS_PERMISSION_DECLARATIONS.complianceReportExport',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.listAllLactationConflicts',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.listLactationConflicts',
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.downloadLactationEvidence',
    ]) {
      assert.include(compact(content), `permissionGate(${gate})`, gate)
    }
  })
})

test.group('work_disability_*_routes — PermissionGate', () => {
  test('incapacidad, periodos, notas y gastos declaran manage-work-disabilities', async ({
    assert,
  }) => {
    const files = [
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const keys = [
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    let joined = ''
    for (const file of files) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of keys) {
      assert.include(
        compact(joined),
        `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      )
    }
    const matches =
      compact(joined).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 12)

    const disabilities = await readFile(
      join(process.cwd(), 'start/routes/work_disability_routes.ts'),
      'utf8'
    )
    assert.notMatch(disabilities, /getByEmployee[\s\S]{0,200}permissionGate/)
  })
})

test.group('lactancia — comprobación legacy intacta', () => {
  test('controladores siguen exigiendo update-information vía assertHasPermission', async ({
    assert,
  }) => {
    const periods = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_periods_controller.ts'),
      'utf8'
    )
    const evidences = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_period_evidences_controller.ts'),
      'utf8'
    )
    assert.include(periods, "update: 'update-information'")
    assert.include(periods, 'assertHasPermission')
    assert.include(periods, "key: 'sin-permiso'")
    assert.include(evidences, 'assertHasPermission')
    assert.include(evidences, "key: 'sin-permiso'")
  })
})

test.group('guards — fuera de alcance de esta historia', () => {
  test('comando y scheduler de aviso automático no usan permissionGate', async ({ assert }) => {
    const command = await readFile(
      join(process.cwd(), 'commands/lactation_notify_expiring.ts'),
      'utf8'
    )
    const scheduler = await readFile(join(process.cwd(), 'start/scheduler.ts'), 'utf8')
    const lactationNotificationConstants = await readFile(
      join(process.cwd(), 'app/constants/employee_lactation_notification.ts'),
      'utf8'
    )
    assert.notInclude(command, 'permissionGate')
    assert.notInclude(command, 'PermissionGate')
    assert.notInclude(scheduler, 'permissionGate')
    assert.include(
      lactationNotificationConstants,
      "export const LACTATION_NOTIFY_EXPIRING_COMMAND = 'lactation:notify-expiring'"
    )
    assert.include(scheduler, 'LACTATION_NOTIFY_EXPIRING_COMMAND')
  })
})

test.group('catálogos de condición médica — PermissionGate', () => {
  /**
   * Antes este caso afirmaba que tipos, propiedades y valores NO tenían gate:
   * cualquier sesión del tenant leía el catálogo y borraba tipos. Solo los
   * consume la pestaña Condición médica, así que exigen sus casillas: GET con
   * -read, POST y PUT con -write, DELETE con -delete (igual que la condición del
   * colaborador).
   */
  test('tipos, propiedades y valores exigen la casilla de la pestaña según el verbo, un gate por ruta', async ({
    assert,
  }) => {
    const read = (key: string) => `EMPLOYEES_READ_PERMISSION_DECLARATIONS.${key}`
    const write = (key: string) => `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key}`
    const files = [
      {
        file: 'start/routes/medical_condition_type_routes.ts',
        controller: 'medicalConditionTypeController',
        routes: [
          ['get', '/', 'index', read('indexMedicalConditionTypes')],
          ['post', '/', 'store', write('createMedicalConditionType')],
          ['get', '/:medicalConditionTypeId', 'show', read('showMedicalConditionType')],
          ['put', '/:medicalConditionTypeId', 'update', write('updateMedicalConditionType')],
          ['delete', '/:medicalConditionTypeId', 'delete', write('deleteMedicalConditionType')],
        ],
      },
      {
        file: 'start/routes/medical_condition_type_property_routes.ts',
        controller: 'medicalConditionTypePropertyController',
        routes: [
          ['get', '/', 'index', read('indexMedicalConditionTypeProperties')],
          ['post', '/', 'store', write('createMedicalConditionTypeProperty')],
          [
            'get',
            '/type/:medicalConditionTypeId',
            'getByType',
            read('getMedicalConditionTypePropertiesByType'),
          ],
          ['get', '/:medicalConditionTypePropertyId', 'show', read('showMedicalConditionTypeProperty')],
          ['put', '/:medicalConditionTypePropertyId', 'update', write('updateMedicalConditionTypeProperty')],
          ['delete', '/:medicalConditionTypePropertyId', 'delete', write('deleteMedicalConditionTypeProperty')],
        ],
      },
      {
        file: 'start/routes/medical_condition_type_property_value_routes.ts',
        controller: 'medicalConditionTypePropertyValueController',
        routes: [
          ['get', '/', 'index', read('indexMedicalConditionPropertyValues')],
          ['post', '/', 'store', write('createMedicalConditionPropertyValue')],
          ['get', '/:medicalConditionTypePropertyValueId', 'show', read('showMedicalConditionPropertyValue')],
          ['put', '/:medicalConditionTypePropertyValueId', 'update', write('updateMedicalConditionPropertyValue')],
          ['delete', '/:medicalConditionTypePropertyValueId', 'delete', write('deleteMedicalConditionPropertyValue')],
        ],
      },
    ] as const

    for (const { file, controller, routes } of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      for (const [method, path, action, gate] of routes) {
        assertInstanceRouteGated(assert, content, {
          method,
          path,
          handler: `${controller}.${action}`,
          gate,
        })
      }
      // Todas las rutas del archivo quedan cubiertas: ninguna nueva sin gate.
      assert.equal(
        (compact(content).match(/router\.(get|post|put|patch|delete)\(/g) ?? []).length,
        routes.length,
        `${file}: rutas sin revisar`
      )
    }
  })
})

test.group('cobertura — 25 escrituras de salud/lactancia/incapacidades', () => {
  test('cada clave del dominio aparece exactamente una vez en rutas', async ({ assert }) => {
    const routeFiles = [
      'start/routes/employee_medical_condition_routes.ts',
      'start/routes/employee_lactation_periods_routes.ts',
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const expected = [
      'createEmployeeMedicalCondition',
      'updateEmployeeMedicalCondition',
      'deleteEmployeeMedicalCondition',
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    assert.equal(expected.length, 25)

    let joined = ''
    for (const file of routeFiles) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of expected) {
      const needle = `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      const count = compact(joined).split(needle).length - 1
      assert.equal(count, 1, `${key} debe aparecer exactamente una vez en rutas`)
    }
    const allMatches =
      compact(joined).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(allMatches.length, 25)
  })
})
