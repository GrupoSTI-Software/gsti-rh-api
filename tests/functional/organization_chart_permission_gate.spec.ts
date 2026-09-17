import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import Department from '#models/department'
import Position from '#models/position'
import PositionKpi from '#models/position_kpi'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import {
  assertModuleEnforced,
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Organigrama con la exigencia encendida: departamentos, puestos, la liga
 * departamento-puesto y el perfil del puesto (funciones, competencias, KPIs,
 * herramientas, certificaciones e historial de aprobación) piden su permiso de
 * `organization-chart`. Quedan abiertos los catálogos que consumen otras
 * pantallas (Empleados, plan de carrera, Evaluaciones, Matriz de habilidades).
 */

const MODULE = 'organization-chart'
/** Id cualquiera: el gate niega antes de que el controlador lo busque. */
const ANY_ID = 1

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

interface GateRequest {
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return request.body ? pending.json(request.body) : pending
}

/** Negativa del gate con el método y la URL en el mensaje, para ubicar la ruta que falló. */
function assertDeniedFor(assert: Assert, response: ApiResponse, request: GateRequest): void {
  const label = `${request.method.toUpperCase()} ${request.url}`
  assert.equal(response.status(), 403, label)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, label)
}

const validKpiPayload = (positionId: number, name: string) => ({
  positionId,
  positionKpiName: name,
  positionKpiIdeal: '10',
  positionKpiScale: 'mayor-es-mejor',
  positionKpiType: 'numerico',
  positionKpiFrequency: 'mensual',
})

test.group('Organigrama — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let superAdmin: TenantActor | null = null
  let department: Department | null = null
  let position: Position | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('organigrama-gate')
    superAdmin = await createBypassActor('super-administrador', 'organigrama-superadmin')
    department = await createDepartmentFixture(actor.businessUnit.businessUnitId, 'Depto gate')
    position = await createPositionFixture(actor.businessUnit.businessUnitId, 'Puesto gate')
  })

  group.teardown(async () => {
    for (const current of [actor, superAdmin]) {
      if (current) {
        await cleanupOrgChartFixtures(current.businessUnit.businessUnitId)
      }
      await cleanupTenantActor(current)
    }
  })

  test('sin concesiones: escrituras y lecturas propias del organigrama responden PERM.DENIED y no tocan los nodos', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const node = required(department, 'el departamento')
    const job = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, [])
    const deniedName = uniqueTestName('Depto negado')
    const businessUnitId = tenant.businessUnit.businessUnitId

    const requests: GateRequest[] = [
      { method: 'get', url: `/api/departments/organization?businessUnitId=${businessUnitId}` },
      { method: 'get', url: '/api/departments/search' },
      { method: 'get', url: `/api/departments/${node.departmentId}` },
      { method: 'post', url: '/api/departments', body: { businessUnitId, departmentName: deniedName } },
      { method: 'post', url: '/api/departments/sync-positions', body: { departmentId: node.departmentId } },
      { method: 'put', url: `/api/departments/${node.departmentId}`, body: { departmentCode: node.departmentCode, departmentName: deniedName } },
      { method: 'delete', url: `/api/departments/${node.departmentId}` },
      { method: 'delete', url: `/api/departments/${node.departmentId}/force-delete` },
      { method: 'post', url: '/api/positions', body: { positionName: deniedName } },
      { method: 'put', url: `/api/positions/${job.positionId}`, body: { positionName: deniedName } },
      { method: 'delete', url: `/api/positions/${job.positionId}` },
      { method: 'get', url: `/api/positions/${job.positionId}` },
      { method: 'get', url: `/api/positions/get-pdf/${job.positionId}` },
      { method: 'get', url: `/api/positions/get-excel/${job.positionId}` },
      { method: 'post', url: '/api/departments-positions', body: { departmentId: node.departmentId, positionId: job.positionId } },
      { method: 'put', url: `/api/departments-positions/${ANY_ID}`, body: {} },
      { method: 'delete', url: `/api/departments-positions/${ANY_ID}` },
      { method: 'delete', url: `/api/departments-positions/${node.departmentId}/${job.positionId}` },
      { method: 'get', url: `/api/departments-positions/${ANY_ID}` },
      { method: 'post', url: '/api/position-kpis', body: validKpiPayload(job.positionId, deniedName) },
      { method: 'put', url: `/api/position-kpis/${ANY_ID}`, body: {} },
      { method: 'delete', url: `/api/position-kpis/${ANY_ID}` },
      { method: 'get', url: '/api/position-kpis/distinct-names' },
      { method: 'post', url: '/api/position-specific-functions', body: {} },
      { method: 'put', url: `/api/position-specific-functions/${ANY_ID}`, body: {} },
      { method: 'delete', url: `/api/position-specific-functions/${ANY_ID}` },
      { method: 'get', url: '/api/position-specific-functions/distinct-names' },
      { method: 'get', url: '/api/position-specific-functions/distinct-frequencies' },
      { method: 'get', url: `/api/position-specific-functions/by-position/${job.positionId}` },
      { method: 'post', url: '/api/position-work-tools', body: {} },
      { method: 'put', url: `/api/position-work-tools/${ANY_ID}`, body: {} },
      { method: 'delete', url: `/api/position-work-tools/${ANY_ID}` },
      { method: 'get', url: '/api/position-work-tools/distinct-names' },
      { method: 'get', url: `/api/position-work-tools/by-position/${job.positionId}` },
      { method: 'post', url: '/api/position-business-unit-competency-levels', body: {} },
      { method: 'put', url: `/api/position-business-unit-competency-levels/${ANY_ID}`, body: {} },
      { method: 'delete', url: `/api/position-business-unit-competency-levels/${ANY_ID}` },
      { method: 'get', url: `/api/positions/${job.positionId}/certification-requirements` },
      { method: 'post', url: `/api/positions/${job.positionId}/certification-requirements`, body: {} },
      { method: 'delete', url: `/api/positions/${job.positionId}/certification-requirements/${ANY_ID}` },
      { method: 'post', url: '/api/position-approval-histories', body: { positionId: job.positionId, positionApprovalHistoryDate: '2026-09-15' } },
      { method: 'get', url: `/api/position-approval-histories/last/${job.positionId}` },
    ]

    for (const request of requests) {
      assertDeniedFor(assert, await send(client, tenant, request), request)
    }

    assert.isNull(await Department.query().where('departmentName', deniedName).first())
    const departmentAfter = await Department.query().where('departmentId', node.departmentId).first()
    assert.equal(departmentAfter?.departmentName, node.departmentName)
    const positionAfter = await Position.query().where('positionId', job.positionId).first()
    assert.equal(positionAfter?.positionName, job.positionName)
    assert.isNull(await PositionKpi.query().where('positionKpiName', deniedName).first())
  })

  test('sin concesiones: los catálogos que consumen otras pantallas siguen abiertos', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const job = required(position, 'el puesto')
    await grantModulePermissions(tenant, MODULE, [])

    const openReads: GateRequest[] = [
      { method: 'get', url: '/api/departments' },
      { method: 'get', url: '/api/positions' },
      { method: 'get', url: `/api/position-kpis/by-position/${job.positionId}` },
      { method: 'get', url: `/api/position-business-unit-competency-levels/by-position/${job.positionId}` },
    ]

    for (const request of openReads) {
      const response = await send(client, tenant, request)
      assert.equal(response.status(), 200, `${request.method.toUpperCase()} ${request.url}`)
    }
  })

  test('cada permiso abre solo su operación: create 201, read 200, update 200, delete 200', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const job = required(position, 'el puesto')
    const organization: GateRequest = {
      method: 'get',
      url: `/api/departments/organization?businessUnitId=${tenant.businessUnit.businessUnitId}`,
    }
    const kpiName = uniqueTestName('KPI con permiso')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const store = await send(client, tenant, {
      method: 'post',
      url: '/api/position-kpis',
      body: validKpiPayload(job.positionId, kpiName),
    })
    store.assertStatus(201)
    const kpi = required(
      await PositionKpi.query().where('positionKpiName', kpiName).first(),
      'el KPI creado'
    )
    assertPermissionDenied(assert, await send(client, tenant, organization))

    await grantModulePermissions(tenant, MODULE, ['read'])
    const tree = await send(client, tenant, organization)
    tree.assertStatus(200)
    const kpiUpdate = (name: string): GateRequest => ({
      method: 'put',
      url: `/api/position-kpis/${kpi.positionKpiId}`,
      body: { ...validKpiPayload(job.positionId, name), positionKpiId: kpi.positionKpiId },
    })
    assertPermissionDenied(
      assert,
      await send(client, tenant, kpiUpdate(uniqueTestName('KPI solo lectura')))
    )

    await grantModulePermissions(tenant, MODULE, ['update'])
    const renamed = uniqueTestName('KPI editado')
    const update = await send(client, tenant, kpiUpdate(renamed))
    update.assertStatus(200)
    const updated = await PositionKpi.query().where('positionKpiId', kpi.positionKpiId).first()
    assert.equal(updated?.positionKpiName, renamed)
    const kpiDelete: GateRequest = { method: 'delete', url: `/api/position-kpis/${kpi.positionKpiId}` }
    assertPermissionDenied(assert, await send(client, tenant, kpiDelete))

    await grantModulePermissions(tenant, MODULE, ['delete'])
    const destroy = await send(client, tenant, kpiDelete)
    destroy.assertStatus(200)
    assert.isNull(await PositionKpi.query().where('positionKpiId', kpi.positionKpiId).first())
  })

  test('el historial de aprobación acepta create o update porque el formulario lo escribe al crear y al editar', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const job = required(position, 'el puesto')
    const approval: GateRequest = {
      method: 'post',
      url: '/api/position-approval-histories',
      body: { positionId: job.positionId, positionApprovalHistoryDate: '2026-09-15' },
    }

    await grantModulePermissions(tenant, MODULE, ['read'])
    assertDeniedFor(assert, await send(client, tenant, approval), approval)

    for (const action of ['create', 'update']) {
      await grantModulePermissions(tenant, MODULE, [action])
      assertPassesGate(assert, await send(client, tenant, approval))
    }
  })

  test('super-administrador cruza el gate por el bypass expanded sin concesiones', async ({
    client,
  }) => {
    const account = required(superAdmin, 'el super-administrador')

    const response = await send(client, account, {
      method: 'get',
      url: `/api/departments/organization?businessUnitId=${account.businessUnit.businessUnitId}`,
    })

    response.assertStatus(200)
  })
})
