import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient } from '@japa/api-client'
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
  setModuleEnforcement,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Bitácora de lactancia con la exigencia encendida:
 *  - El reporte de cumplimiento y su PDF exigen `employee-lactation-periods:read`.
 *    Antes pedían `employees:tab-periodos-lactancia-read` en la ruta y
 *    `employees:read` en el controller, mientras el backoffice abría la pantalla
 *    con el permiso de la bitácora.
 *  - La URL firmada de una evidencia exige `employees:tab-periodos-lactancia-read`.
 *    Antes bastaba `employees:read`, el permiso del listado general.
 *
 * La empresa del actor no tiene periodos: el reporte responde 200 vacío y la
 * descarga, 404 una vez que cruza el gate.
 */

const MODULE = 'employee-lactation-periods'
const EMPLOYEES_MODULE = 'employees'
/** Id que no existe: el gate decide antes de que el service busque la evidencia. */
const MISSING_ID = 2_147_483_647

interface ApiCall {
  label: string
  url: string
}

const reportCall: ApiCall = {
  label: 'reporte de cumplimiento',
  url: '/api/employee-lactation-periods/compliance-report?page=1&limit=10',
}

const exportCall: ApiCall = {
  label: 'PDF del reporte de cumplimiento',
  url: '/api/employee-lactation-periods/compliance-report/export?page=1&limit=10',
}

const downloadCall: ApiCall = {
  label: 'URL firmada de evidencia',
  url: `/api/employee-lactation-periods/${MISSING_ID}/evidences/${MISSING_ID}/download-url`,
}

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  return client.get(call.url).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

async function assertDeniedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
) {
  for (const call of calls) {
    assertPermissionDenied(assert, await send(client, actor, call))
  }
}

test.group('Bitácora de lactancia — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let previousEmployeesEnforcement: boolean | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    // La descarga de evidencias usa el gate de Empleados. Specs anteriores
    // apagan esa exigencia y no siempre la restauran: el grupo la enciende y
    // al final deja el valor que encontró.
    previousEmployeesEnforcement = await setModuleEnforcement(EMPLOYEES_MODULE, true)
    owner = await createBypassActor('owner', 'lactancia-owner')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
    if (previousEmployeesEnforcement !== null) {
      await setModuleEnforcement(EMPLOYEES_MODULE, previousEmployeesEnforcement)
    }
  })

  group.each.setup(async () => {
    actor = await createTenantActor('lactancia-gate')
  })

  group.each.teardown(async () => {
    await cleanupTenantActor(actor)
    actor = null
  })

  test('sin concesiones: reporte, PDF y descarga de evidencias responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    await assertDeniedAll(assert, client, tenant, [reportCall, exportCall, downloadCall])
  })

  test('los permisos de Empleados que pedía el reporte ya no lo abren', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['read', 'tab-periodos-lactancia-read'])

    await assertDeniedAll(assert, client, tenant, [reportCall, exportCall])
  })

  test('employee-lactation-periods:read abre el reporte y el PDF, no la descarga de evidencias', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['read'])

    const report = await send(client, tenant, reportCall)
    assert.equal(report.status(), 200, JSON.stringify(report.body()))

    const pdf = await send(client, tenant, exportCall)
    assert.equal(pdf.status(), 200)
    assert.include(String(pdf.header('content-type')), 'application/pdf')

    await assertDeniedAll(assert, client, tenant, [downloadCall])
  })

  test('descarga de evidencias: el read del listado ya no firma URLs; la pestaña de lactancia sí', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')

    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['read'])
    await assertDeniedAll(assert, client, tenant, [downloadCall])

    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['tab-periodos-lactancia-read'])
    const download = await send(client, tenant, downloadCall)
    assertPassesGate(assert, download)
    assert.equal(download.status(), 404, JSON.stringify(download.body()))
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    const report = await send(client, account, reportCall)
    assertPassesGate(assert, report)
    assert.equal(report.status(), 200, JSON.stringify(report.body()))
  })
})
