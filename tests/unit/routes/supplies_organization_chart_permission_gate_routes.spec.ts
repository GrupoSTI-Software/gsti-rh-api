import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { ORGANIZATION_CHART_PERMISSION_DECLARATIONS } from '#constants/organization_chart_permission_declarations'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

/**
 * Protección vigente de Activos e insumos y del Organigrama en el API: qué ruta
 * declara `permissionGate` y cuál queda abierta a propósito. Las lecturas
 * abiertas son catálogos que consumen otras pantallas (Matriz de vencimientos,
 * Empleados, Evaluaciones, Matriz de habilidades, plan de carrera); si alguien
 * les pone gate, esas pantallas responden 403 aunque el rol administre bien su
 * propio módulo.
 */

interface RouteDeclaration {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  path: string
  handler: string
}

interface GatedRoute extends RouteDeclaration {
  /** Identificador completo, p. ej. `SUPPLIES_PERMISSION_DECLARATIONS.storeSupply`. */
  declaration: string
}

interface RouteFileContract {
  file: string
  gated: GatedRoute[]
  open: RouteDeclaration[]
  businessScope: boolean
}

/** `file` sin carpeta vive en `start/routes`; con carpeta, es relativo a la raíz (módulos verticales). */
const readRoutes = (fileName: string) =>
  readFileSync(
    join(process.cwd(), fileName.includes('/') ? fileName : join('start/routes', fileName)),
    'utf-8'
  )

/** Sin espacios ni saltos, para no depender del formato de la cadena. */
const compact = (content: string) => content.replace(/\s+/g, '')

/** El handler con `#` va completo (módulos verticales); sin él, cuelga de `#controllers/`. */
const routeDeclaration = (route: RouteDeclaration) => {
  const handler = route.handler.startsWith('#') ? route.handler : `#controllers/${route.handler}`
  return compact(`router.${route.method}('${route.path}', '${handler}')`)
}

function assertGated(assert: Assert, content: string, route: GatedRoute) {
  assert.include(
    compact(content),
    routeDeclaration(route) + compact(`.use(middleware.permissionGate(${route.declaration}))`),
    `${route.method.toUpperCase()} ${route.path} debe declarar ${route.declaration}`
  )
}

function assertOpen(assert: Assert, content: string, route: RouteDeclaration) {
  const flat = compact(content)
  const declaration = routeDeclaration(route)
  const index = flat.indexOf(declaration)

  assert.isAbove(index, -1, `${route.method.toUpperCase()} ${route.path} debe existir`)
  assert.isFalse(
    flat.slice(index + declaration.length).startsWith('.use('),
    `${route.method.toUpperCase()} ${route.path} debe quedar sin gate`
  )
}

/** Un solo `permissionGate` por ruta: el conteo del archivo delata un gate apilado. */
const gateCount = (content: string) => (content.match(/middleware\.permissionGate\(/g) ?? []).length

function assertRouteFileContract(assert: Assert, contract: RouteFileContract) {
  const content = readRoutes(contract.file)

  for (const route of contract.gated) assertGated(assert, content, route)
  for (const route of contract.open) assertOpen(assert, content, route)
  assert.equal(gateCount(content), contract.gated.length, `${contract.file}: gates inesperados`)
  assert.include(content, 'middleware.auth()')
  if (contract.businessScope) {
    assert.include(content, 'middleware.businessScope()')
  }
}

/**
 * Cada declaración la usa exactamente una ruta: una clave sin ruta es una
 * operación que parece protegida y no lo está; una clave repetida suele ser un
 * copiar y pegar que dejó otra ruta con el permiso equivocado.
 */
function assertEachDeclarationUsedOnce(
  assert: Assert,
  contracts: RouteFileContract[],
  exportName: string,
  declarations: Record<string, PermissionGateOptions>
) {
  const used = contracts
    .flatMap((contract) => contract.gated)
    .map((route) => route.declaration)
    .filter((declaration) => declaration.startsWith(`${exportName}.`))
    .map((declaration) => declaration.slice(exportName.length + 1))
    .sort()

  assert.deepEqual(used, Object.keys(declarations).sort())
}

const supplies = (key: keyof typeof SUPPLIES_PERMISSION_DECLARATIONS) =>
  `SUPPLIES_PERMISSION_DECLARATIONS.${key}`

const SUPPLIES_ROUTE_FILES: RouteFileContract[] = [
  {
    file: 'supply_type.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/supply-types', handler: 'supply_types_controller.store', declaration: supplies('storeSupplyType') },
      { method: 'get', path: '/supply-types', handler: 'supply_types_controller.index', declaration: supplies('indexSupplyTypes') },
      { method: 'get', path: '/supply-types/:id', handler: 'supply_types_controller.show', declaration: supplies('showSupplyType') },
      { method: 'put', path: '/supply-types/:id', handler: 'supply_types_controller.update', declaration: supplies('updateSupplyType') },
      { method: 'delete', path: '/supply-types/:id', handler: 'supply_types_controller.destroy', declaration: supplies('destroySupplyType') },
      { method: 'get', path: '/supply-types/:id/characteristics', handler: 'supply_types_controller.getWithCharacteristics', declaration: supplies('showSupplyTypeWithCharacteristics') },
    ],
    open: [],
  },
  {
    file: 'supplies.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/supplies', handler: 'supplies_controller.store', declaration: supplies('storeSupply') },
      { method: 'get', path: '/supplies', handler: 'supplies_controller.index', declaration: supplies('indexSupplies') },
      { method: 'get', path: '/supplies/excel', handler: 'supplies_controller.getExcel', declaration: 'EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.getSuppliesExcel' },
      { method: 'put', path: '/supplies/:id', handler: 'supplies_controller.update', declaration: supplies('updateSupply') },
      { method: 'delete', path: '/supplies/:id', handler: 'supplies_controller.destroy', declaration: supplies('destroySupply') },
      { method: 'post', path: '/supplies/:id/deactivate', handler: 'supplies_controller.deactivate', declaration: supplies('deactivateSupply') },
      { method: 'get', path: '/supplies/:id/with-type', handler: 'supplies_controller.getWithType', declaration: supplies('showSupplyWithType') },
      { method: 'get', path: '/supplies/by-type/:supplyTypeId', handler: 'supplies_controller.getByType', declaration: supplies('indexSuppliesByType') },
    ],
    open: [{ method: 'get', path: '/supplies/:id', handler: 'supplies_controller.show' }],
  },
  {
    file: 'supplie_caracteristics.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/supplie-characteristics', handler: 'supplie_caracteristics_controller.store', declaration: supplies('storeSupplyCharacteristic') },
      { method: 'get', path: '/supplie-characteristics', handler: 'supplie_caracteristics_controller.index', declaration: supplies('indexSupplyCharacteristics') },
      { method: 'get', path: '/supplie-characteristics/:id', handler: 'supplie_caracteristics_controller.show', declaration: supplies('showSupplyCharacteristic') },
      { method: 'put', path: '/supplie-characteristics/:id', handler: 'supplie_caracteristics_controller.update', declaration: supplies('updateSupplyCharacteristic') },
      { method: 'delete', path: '/supplie-characteristics/:id', handler: 'supplie_caracteristics_controller.destroy', declaration: supplies('destroySupplyCharacteristic') },
      { method: 'get', path: '/supplie-characteristics/:id/values', handler: 'supplie_caracteristics_controller.getWithValues', declaration: supplies('showSupplyCharacteristicWithValues') },
      { method: 'get', path: '/supplie-characteristics/by-supply-type/:supplyTypeId', handler: 'supplie_caracteristics_controller.getBySupplyType', declaration: supplies('indexSupplyCharacteristicsBySupplyType') },
    ],
    open: [],
  },
  {
    file: 'supplie_caracteristic_values.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/supplie-characteristic-values', handler: 'supplie_caracteristic_values_controller.store', declaration: supplies('storeSupplyCharacteristicValue') },
      { method: 'get', path: '/supplie-characteristic-values', handler: 'supplie_caracteristic_values_controller.index', declaration: supplies('indexSupplyCharacteristicValues') },
      { method: 'get', path: '/supplie-characteristic-values/:id', handler: 'supplie_caracteristic_values_controller.show', declaration: supplies('showSupplyCharacteristicValue') },
      { method: 'put', path: '/supplie-characteristic-values/:id', handler: 'supplie_caracteristic_values_controller.update', declaration: supplies('updateSupplyCharacteristicValue') },
      { method: 'delete', path: '/supplie-characteristic-values/:id', handler: 'supplie_caracteristic_values_controller.destroy', declaration: supplies('destroySupplyCharacteristicValue') },
      { method: 'get', path: '/supplie-characteristic-values/:id/characteristic', handler: 'supplie_caracteristic_values_controller.getWithCharacteristic', declaration: supplies('showSupplyCharacteristicValueWithCharacteristic') },
      { method: 'get', path: '/supplie-characteristic-values/by-characteristic/:supplieCaracteristicId', handler: 'supplie_caracteristic_values_controller.getByCharacteristic', declaration: supplies('indexSupplyCharacteristicValuesByCharacteristic') },
      { method: 'get', path: '/supplie-characteristic-values/by-supply/:supplieId', handler: 'supplie_caracteristic_values_controller.getBySupply', declaration: supplies('indexSupplyCharacteristicValuesBySupply') },
    ],
    open: [],
  },
  {
    file: 'supply_value_histories.ts',
    businessScope: true,
    gated: [
      { method: 'get', path: '/supply-value-histories', handler: 'supply_value_histories_controller.index', declaration: supplies('indexSupplyValueHistories') },
      { method: 'post', path: '/supply-value-histories', handler: 'supply_value_histories_controller.store', declaration: supplies('storeSupplyValueHistory') },
      { method: 'get', path: '/supply-value-histories/:id', handler: 'supply_value_histories_controller.show', declaration: supplies('showSupplyValueHistory') },
      { method: 'put', path: '/supply-value-histories/:id', handler: 'supply_value_histories_controller.update', declaration: supplies('updateSupplyValueHistory') },
      { method: 'delete', path: '/supply-value-histories/:id', handler: 'supply_value_histories_controller.destroy', declaration: supplies('destroySupplyValueHistory') },
      { method: 'get', path: '/supplies/:supplyId/value-histories', handler: 'supply_value_histories_controller.getBySupply', declaration: supplies('indexSupplyValueHistoriesBySupply') },
      { method: 'get', path: '/supplies/:supplyId/value-histories/latest', handler: 'supply_value_histories_controller.getLatestValue', declaration: supplies('showLatestSupplyValueHistory') },
    ],
    open: [],
  },
  {
    file: 'app/modules/assets/assets.routes.ts',
    businessScope: true,
    gated: [
      { method: 'get', path: '/assets', handler: '#modules/assets/assets.controller.index', declaration: supplies('indexAssets') },
      { method: 'get', path: '/assets/summary', handler: '#modules/assets/assets.controller.summary', declaration: supplies('showAssetsSummary') },
      { method: 'get', path: '/assets/:supplyId', handler: '#modules/assets/assets.controller.show', declaration: supplies('showAsset') },
      { method: 'get', path: '/assets/:supplyId/assignments', handler: '#modules/assets/assets.controller.assignments', declaration: supplies('indexAssetAssignments') },
      { method: 'get', path: '/assets/:supplyId/value-history', handler: '#modules/assets/assets.controller.valueHistory', declaration: supplies('showAssetValueHistory') },
      { method: 'put', path: '/assets/:supplyId/characteristic-values', handler: '#modules/assets/assets.controller.upsertCharacteristicValues', declaration: supplies('upsertAssetCharacteristicValues') },
      { method: 'get', path: '/asset-types', handler: '#modules/assets/assets.controller.types', declaration: supplies('indexAssetTypes') },
      { method: 'get', path: '/employee-supplies-response-contracts/:id/file', handler: '#modules/assets/asset_files.controller.responseContract', declaration: supplies('downloadSupplyResponseContract') },
      { method: 'get', path: '/employee-supply-assignation-photos/photo/:photoId/file', handler: '#modules/assets/asset_files.controller.assignationPhoto', declaration: supplies('downloadSupplyAssignationPhoto') },
    ],
    open: [],
  },
]

const orgChart = (key: keyof typeof ORGANIZATION_CHART_PERMISSION_DECLARATIONS) =>
  `ORGANIZATION_CHART_PERMISSION_DECLARATIONS.${key}`

const ORGANIZATION_CHART_ROUTE_FILES: RouteFileContract[] = [
  {
    file: 'department_routes.ts',
    businessScope: true,
    gated: [
      { method: 'get', path: '/organization', handler: 'department_controller.getOrganization', declaration: orgChart('showOrganizationTree') },
      { method: 'get', path: '/search', handler: 'department_controller.getSearch', declaration: orgChart('searchDepartments') },
      { method: 'get', path: '/:departmentId', handler: 'department_controller.show', declaration: orgChart('showDepartment') },
      { method: 'post', path: '/', handler: 'department_controller.store', declaration: orgChart('storeDepartment') },
      { method: 'post', path: '/sync-positions', handler: 'department_controller.syncPositions', declaration: orgChart('syncDepartmentPositions') },
      { method: 'put', path: '/:departmentId', handler: 'department_controller.update', declaration: orgChart('updateDepartment') },
      { method: 'delete', path: '/:departmentId', handler: 'department_controller.delete', declaration: orgChart('deleteDepartment') },
      { method: 'delete', path: '/:departmentId/force-delete', handler: 'department_controller.forceDelete', declaration: orgChart('forceDeleteDepartment') },
    ],
    open: [
      { method: 'get', path: '/', handler: 'department_controller.getAll' },
      { method: 'get', path: '/get-only-with-employees/', handler: 'department_controller.getOnlyWithEmployees' },
      { method: 'get', path: '/:departmentId/positions', handler: 'department_controller.getPositions' },
      { method: 'get', path: '/:departmentId/get-rotation-index', handler: 'department_controller.getRotationIndex' },
      // El controlador ya verifica update con OrgChartMoveService.
      { method: 'patch', path: '/:departmentId/move', handler: 'department_controller.move' },
    ],
  },
  {
    file: 'position_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_controller.store', declaration: orgChart('storePosition') },
      { method: 'put', path: '/:positionId', handler: 'position_controller.update', declaration: orgChart('updatePosition') },
      { method: 'delete', path: '/:positionId', handler: 'position_controller.delete', declaration: orgChart('deletePosition') },
      { method: 'get', path: '/:positionId', handler: 'position_controller.show', declaration: orgChart('showPosition') },
      { method: 'get', path: '/get-pdf/:positionId', handler: 'position_controller.getPdf', declaration: orgChart('downloadPositionPdf') },
      { method: 'get', path: '/get-excel/:positionId', handler: 'position_controller.getExcel', declaration: orgChart('downloadPositionExcel') },
    ],
    open: [
      { method: 'get', path: '/', handler: 'position_controller.get' },
      // El controlador ya verifica update con OrgChartMoveService.
      { method: 'patch', path: '/:positionId/move', handler: 'position_controller.move' },
    ],
  },
  {
    file: 'department_position_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'department_position_controller.store', declaration: orgChart('storeDepartmentPosition') },
      { method: 'put', path: '/:departmentPositionId', handler: 'department_position_controller.update', declaration: orgChart('updateDepartmentPosition') },
      { method: 'delete', path: '/:departmentPositionId', handler: 'department_position_controller.delete', declaration: orgChart('deleteDepartmentPosition') },
      { method: 'delete', path: '/:departmentId/:positionId', handler: 'department_position_controller.deleteRelation', declaration: orgChart('deleteDepartmentPositionRelation') },
      { method: 'get', path: '/:departmentPositionId', handler: 'department_position_controller.show', declaration: orgChart('showDepartmentPosition') },
    ],
    open: [],
  },
  {
    file: 'position_kpi_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_kpi_controller.store', declaration: orgChart('storePositionKpi') },
      { method: 'put', path: '/:positionKpiId', handler: 'position_kpi_controller.update', declaration: orgChart('updatePositionKpi') },
      { method: 'delete', path: '/:positionKpiId', handler: 'position_kpi_controller.delete', declaration: orgChart('deletePositionKpi') },
      { method: 'get', path: '/distinct-names', handler: 'position_kpi_controller.getDistinctNames', declaration: orgChart('distinctPositionKpiNames') },
    ],
    open: [{ method: 'get', path: '/by-position/:positionId', handler: 'position_kpi_controller.getByPosition' }],
  },
  {
    file: 'position_specific_function_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_specific_function_controller.store', declaration: orgChart('storePositionSpecificFunction') },
      { method: 'put', path: '/:positionSpecificFunctionId', handler: 'position_specific_function_controller.update', declaration: orgChart('updatePositionSpecificFunction') },
      { method: 'delete', path: '/:positionSpecificFunctionId', handler: 'position_specific_function_controller.delete', declaration: orgChart('deletePositionSpecificFunction') },
      { method: 'get', path: '/distinct-names', handler: 'position_specific_function_controller.getDistinctNames', declaration: orgChart('distinctPositionSpecificFunctionNames') },
      { method: 'get', path: '/distinct-frequencies', handler: 'position_specific_function_controller.getDistinctFrequencies', declaration: orgChart('distinctPositionSpecificFunctionFrequencies') },
      { method: 'get', path: '/by-position/:positionId', handler: 'position_specific_function_controller.getByPosition', declaration: orgChart('indexPositionSpecificFunctionsByPosition') },
    ],
    open: [],
  },
  {
    file: 'position_work_tool_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_work_tool_controller.store', declaration: orgChart('storePositionWorkTool') },
      { method: 'put', path: '/:positionWorkToolId', handler: 'position_work_tool_controller.update', declaration: orgChart('updatePositionWorkTool') },
      { method: 'delete', path: '/:positionWorkToolId', handler: 'position_work_tool_controller.delete', declaration: orgChart('deletePositionWorkTool') },
      { method: 'get', path: '/distinct-names', handler: 'position_work_tool_controller.getDistinctNames', declaration: orgChart('distinctPositionWorkToolNames') },
      { method: 'get', path: '/by-position/:positionId', handler: 'position_work_tool_controller.getByPosition', declaration: orgChart('indexPositionWorkToolsByPosition') },
    ],
    open: [],
  },
  {
    file: 'position_business_unit_competency_level_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_business_unit_competency_level_controller.store', declaration: orgChart('storePositionCompetencyLevel') },
      { method: 'put', path: '/:positionBusinessUnitCompetencyLevelId', handler: 'position_business_unit_competency_level_controller.update', declaration: orgChart('updatePositionCompetencyLevel') },
      { method: 'delete', path: '/:positionBusinessUnitCompetencyLevelId', handler: 'position_business_unit_competency_level_controller.delete', declaration: orgChart('deletePositionCompetencyLevel') },
    ],
    open: [
      { method: 'get', path: '/by-position/:positionId', handler: 'position_business_unit_competency_level_controller.getByPosition' },
    ],
  },
  {
    file: 'position_certification_requirement_routes.ts',
    businessScope: true,
    gated: [
      { method: 'get', path: '/:positionId/certification-requirements', handler: 'position_certification_requirement_controller.index', declaration: orgChart('indexPositionCertificationRequirements') },
      { method: 'post', path: '/:positionId/certification-requirements', handler: 'position_certification_requirement_controller.store', declaration: orgChart('storePositionCertificationRequirements') },
      { method: 'delete', path: '/:positionId/certification-requirements/:certificationId', handler: 'position_certification_requirement_controller.destroy', declaration: orgChart('destroyPositionCertificationRequirement') },
    ],
    open: [],
  },
  {
    file: 'position_approval_history_routes.ts',
    businessScope: true,
    gated: [
      { method: 'post', path: '/', handler: 'position_approval_history_controller.store', declaration: orgChart('storePositionApprovalHistory') },
      { method: 'get', path: '/last/:positionId', handler: 'position_approval_history_controller.getLast', declaration: orgChart('showLastPositionApprovalHistory') },
    ],
    open: [],
  },
]

test.group('Activos e insumos — permissionGate en las rutas del catálogo', () => {
  for (const contract of SUPPLIES_ROUTE_FILES) {
    test(`${contract.file}: cada ruta declara su permiso y solo quedan abiertas las que consumen otras pantallas`, ({
      assert,
    }) => {
      assertRouteFileContract(assert, contract)
    })
  }

  test('cada declaración de activos la usa exactamente una ruta', ({ assert }) => {
    assertEachDeclarationUsedOnce(
      assert,
      SUPPLIES_ROUTE_FILES,
      'SUPPLIES_PERMISSION_DECLARATIONS',
      SUPPLIES_PERMISSION_DECLARATIONS
    )
  })

  test('las declaraciones piden permisos de supplies con bypass standard', ({ assert }) => {
    for (const [key, options] of Object.entries(SUPPLIES_PERMISSION_DECLARATIONS)) {
      assert.equal(options.module, 'supplies', key)
      assert.equal(options.bypass, 'standard', key)
    }
  })

  test('valores de característica e historial aceptan create o update; la baja lógica pide update', ({
    assert,
  }) => {
    assert.deepEqual(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyCharacteristicValue.action, [
      'create',
      'update',
    ])
    assert.deepEqual(SUPPLIES_PERMISSION_DECLARATIONS.storeSupplyValueHistory.action, [
      'create',
      'update',
    ])
    assert.equal(SUPPLIES_PERMISSION_DECLARATIONS.deactivateSupply.action, 'update')
  })
})

test.group('Organigrama — permissionGate en departamentos, puestos y perfil del puesto', () => {
  for (const contract of ORGANIZATION_CHART_ROUTE_FILES) {
    test(`${contract.file}: cada ruta declara su permiso y solo quedan abiertas las que consumen otras pantallas`, ({
      assert,
    }) => {
      assertRouteFileContract(assert, contract)
    })
  }

  test('cada declaración del organigrama la usa exactamente una ruta', ({ assert }) => {
    assertEachDeclarationUsedOnce(
      assert,
      ORGANIZATION_CHART_ROUTE_FILES,
      'ORGANIZATION_CHART_PERMISSION_DECLARATIONS',
      ORGANIZATION_CHART_PERMISSION_DECLARATIONS
    )
  })

  test('las declaraciones piden permisos de organization-chart con bypass expanded', ({ assert }) => {
    for (const [key, options] of Object.entries(ORGANIZATION_CHART_PERMISSION_DECLARATIONS)) {
      assert.equal(options.module, 'organization-chart', key)
      assert.equal(options.bypass, 'expanded', key)
    }
  })

  test('el historial de aprobación acepta create o update; sync-positions pide create', ({
    assert,
  }) => {
    assert.deepEqual(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.storePositionApprovalHistory.action, [
      'create',
      'update',
    ])
    assert.equal(ORGANIZATION_CHART_PERMISSION_DECLARATIONS.syncDepartmentPositions.action, 'create')
  })

  test('position-assessment-profiles no se toca aquí: lo decide el grupo de plantillas de evaluación', ({
    assert,
  }) => {
    assert.notInclude(readRoutes('position_assessment_profile_routes.ts'), 'ORGANIZATION_CHART_PERMISSION_DECLARATIONS')
  })
})
