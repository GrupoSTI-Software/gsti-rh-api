import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Assist from '#models/assist'
import { TenantContext } from '#utils/tenant_context'
import {
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
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'

/**
 * Monitor de asistencia con la exigencia encendida.
 *
 * Anular una checada y sincronizar la asistencia de un empleado no verificaban
 * permiso: el panel de asistencia ocultaba los botones, pero cualquier sesión
 * del tenant podía llamar al API. Ahora exigen `delete-check-assist` y
 * `sync-assist` del monitor, con bypass standard (root y owner).
 *
 * El actor tiene empresa propia y un colaborador de esa empresa; cada caso
 * crea su checada y la borra al terminar.
 */

const MODULE = 'employees-attendance-monitor'
const NON_EXISTENT_ASSIST_ID = 2_147_483_639

/** Casillas del monitor que no son las dos que protegen estas rutas. */
const OTHER_MONITOR_PERMISSIONS = [
  'read',
  'read-time-worked',
  'consecutive-faults',
  'shift-coverage',
  'see-payroll',
  'display-payments-summary',
  'display-discounts-summary',
  'add-assist-manual',
  'download-summary',
] as const

async function createAssistFor(fixture: EmployeeFixture, label: string): Promise<Assist> {
  const punchTime = DateTime.now().setZone('UTC-6').startOf('day').plus({ hours: 8 })
  const maxSyncRow: { maxSyncId: number | null } | null = await db
    .from('assists')
    .max('assist_sync_id as maxSyncId')
    .first()

  return TenantContext.runUnscoped(async () => {
    const assist = new Assist()
    assist.assistEmpCode = String(fixture.employee.employeeCode)
    // Serie única por caso: la llave natural (empresa, empleado, hora y serie)
    // no admite dos checadas iguales.
    assist.assistTerminalSn = `TEST-MONITOR-GATE-${Date.now()}`
    assist.assistTerminalAlias = label
    assist.assistAreaAlias = 'TEST'
    assist.assistLongitude = 0
    assist.assistLatitude = 0
    assist.assistPrecision = 0
    assist.assistUploadTime = punchTime
    assist.assistEmpId = fixture.employee.employeeId
    assist.businessUnitId = fixture.businessUnitId
    assist.assistTerminalId = null
    assist.assistSyncId = Number(maxSyncRow?.maxSyncId ?? 0) + 1
    assist.assistActive = 1
    assist.assistType = 'check'
    assist.assistPunchTime = punchTime
    assist.assistPunchTimeUtc = punchTime
    assist.assistPunchTimeOrigin = punchTime
    await assist.save()
    return assist
  }, 'fixture de checada del gate del monitor')
}

function inactivate(client: ApiClient, actor: TenantActor, assistId: number) {
  return client
    .put(`/api/v1/assists/${assistId}/inactivate`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

/**
 * Sin fechas a propósito: el validador las exige y responde 422 sin salir a la
 * red. Aquí solo importa si la petición cruza el gate; el contenido de esa
 * negativa se prueba en su propio caso.
 */
function synchronizeEmployee(client: ApiClient, actor: TenantActor) {
  return client
    .post('/api/v1/assists/employee-synchronize')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({ empCode: 'SIN-EQUIPO' })
}

/**
 * Sincronización general. Solo se usa en los casos que el gate NIEGA: cuando la
 * petición lo cruza, el servicio sale a buscar al equipo biométrico y un test no
 * puede depender de eso. Lo que este archivo prueba de ella es que ya no la
 * decide el controller con su propio `AST.AUTHZ.003`, sino el gate.
 */
function synchronizeAll(client: ApiClient, actor: TenantActor) {
  return client
    .post('/api/v1/assists/synchronize')
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
}

function assertDenied(assert: Assert, response: ApiResponse, label: string): void {
  assert.equal(response.status(), 403, `${label}: ${JSON.stringify(response.body())}`)
  assertPermissionDenied(assert, response)
}

async function isAssistActive(assistId: number): Promise<boolean> {
  const row: { assist_active: number } | null = await db
    .from('assists')
    .where('assist_id', assistId)
    .select('assist_active')
    .first()
  return row?.assist_active === 1
}

test.group('Monitor de asistencia — permissionGate de anular checada y sincronizar por empleado', (group) => {
  let previousEnforcement = true
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let assist: Assist | null = null

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement(MODULE, true)
    actor = await createTenantActor('monitor-gate')
    owner = await createBypassActor('owner', 'monitor-gate-owner')
    employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'monitor-gate')
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
    await setModuleEnforcement(MODULE, previousEnforcement)
  })

  group.each.setup(async () => {
    assist = await createAssistFor(required(employee, 'el colaborador'), 'monitor-gate')
  })

  group.each.teardown(async () => {
    const employeeId = required(employee, 'el colaborador').employee.employeeId
    // Anular recalcula el calendario del día: se borra junto con la checada.
    await db.from('employee_assist_calendars').where('employee_id', employeeId).delete()
    await db.from('assists').where('assist_emp_id', employeeId).delete()
    assist = null
  })

  test('sin concesiones: anular checada y las dos sincronizaciones responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const checada = required(assist, 'la checada')
    await grantModulePermissions(tenant, MODULE, [])

    assertDenied(assert, await inactivate(client, tenant, checada.assistId), 'anular checada')
    assert.isTrue(await isAssistActive(checada.assistId), 'la checada debe seguir activa')
    assertDenied(assert, await synchronizeEmployee(client, tenant), 'sincronizar por empleado')
    // Antes respondía 403 con `AST.AUTHZ.003` desde el controller: misma
    // decisión, otra forma de negativa. Ahora la niega el gate como las demás.
    assertDenied(assert, await synchronizeAll(client, tenant), 'sincronización general')
  })

  test('delete-check-assist anula la checada propia y no abre la sincronización', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const checada = required(assist, 'la checada')
    await grantModulePermissions(tenant, MODULE, ['delete-check-assist'])

    const response = await inactivate(client, tenant, checada.assistId)
    assert.equal(response.status(), 200, JSON.stringify(response.body()))
    assert.isFalse(await isAssistActive(checada.assistId), 'la checada debe quedar inactiva')

    assertDenied(assert, await synchronizeEmployee(client, tenant), 'sincronizar por empleado')
  })

  test('sync-assist cruza el gate de la sincronización por empleado y no anula checadas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const checada = required(assist, 'la checada')
    await grantModulePermissions(tenant, MODULE, ['sync-assist'])

    const sync = await synchronizeEmployee(client, tenant)
    assertPassesGate(assert, sync)
    sync.assertStatus(422)

    assertDenied(assert, await inactivate(client, tenant, checada.assistId), 'anular checada')
    assert.isTrue(await isAssistActive(checada.assistId), 'la checada debe seguir activa')
  })

  test('el resto de casillas del monitor no abre ninguna de las tres operaciones', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const checada = required(assist, 'la checada')
    await grantModulePermissions(tenant, MODULE, OTHER_MONITOR_PERMISSIONS)

    assertDenied(assert, await inactivate(client, tenant, checada.assistId), 'anular checada')
    assertDenied(assert, await synchronizeEmployee(client, tenant), 'sincronizar por empleado')
    assertDenied(assert, await synchronizeAll(client, tenant), 'sincronización general')
  })

  /**
   * Ejerce anular checada y sincronizar por empleado. La sincronización general
   * es la tercera ruta con gate y NO se ejerce aquí: cruzado el gate, el
   * servicio sale a buscar al equipo biométrico y un test no puede depender de
   * eso. De ella este archivo prueba solo la negativa.
   */
  test('owner pasa el gate de anular y el de sincronizar por empleado (bypass standard)', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')

    const missing = await inactivate(client, account, NON_EXISTENT_ASSIST_ID)
    assertPassesGate(assert, missing)
    missing.assertStatus(404)

    const sync = await synchronizeEmployee(client, account)
    assertPassesGate(assert, sync)
    sync.assertStatus(422)
  })

  test('la sincronización por empleado sin rango responde 422 con título, detalle y key', async ({
    client,
    assert,
  }) => {
    // Antes reventaba dentro del servicio (`new Date(undefined)`) y salía como
    // un 400 crudo `{ message: 'Invalid time value' }`: el panel de asistencia
    // no podía distinguirlo de una caída del equipo biométrico.
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['sync-assist'])

    const response = await synchronizeEmployee(client, tenant)

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'datos-invalidos-para-sincronizar-asistencia')
    assert.equal(body.code, ASSIST_ERROR_CODES.VAL_SYNC_RANGE)
    assert.isString(body.title)
    assert.isNotEmpty(body.title)
    assert.isString(body.detail)
    assert.isNotEmpty(body.detail)
    assert.notInclude(body.detail, 'Invalid time value')
  })

  test('una fecha imposible responde 422 y no revienta dentro del servicio', async ({
    client,
    assert,
  }) => {
    // El regex `^\d{4}-\d{2}-\d{2}([T ].*)?$` acepta `2026-13-45` y
    // `2026-09-15Tzzz`: las dos pasaban el 422 y reventaban igual que antes en
    // `new Date(...).toISOString()`, saliendo como el mismo 400 crudo
    // `{ message: 'Invalid time value' }` que el validador venía a cerrar.
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, ['sync-assist'])

    for (const rango of [
      { startDate: '2026-13-45', endDate: '2026-09-15', caso: 'mes y día imposibles' },
      { startDate: '2026-09-15', endDate: '2026-09-15Tzzz', caso: 'sufijo no interpretable' },
      { startDate: '2026-02-30', endDate: '2026-03-05', caso: 'día que no existe en el mes' },
      { startDate: '2026-09-07', endDate: '2026-09-01', caso: 'rango invertido' },
    ]) {
      const response = await client
        .post('/api/v1/assists/employee-synchronize')
        .loginAs(tenant.user)
        .headers(businessUnitHeaders(tenant))
        .json({ empCode: 'SIN-EQUIPO', startDate: rango.startDate, endDate: rango.endDate })

      assert.equal(response.status(), 422, `${rango.caso}: ${JSON.stringify(response.body())}`)
      assert.equal(response.body()?.key, 'datos-invalidos-para-sincronizar-asistencia', rango.caso)
      assert.notInclude(response.body()?.detail ?? '', 'Invalid time value', rango.caso)
    }
  })

  test('con la exigencia del módulo apagada, el gate deja pasar la sincronización por empleado', async ({
    client,
    assert,
  }) => {
    /**
     * Decisión explícita y probada. Pasar las sincronizaciones del `hasAccess`
     * del controller al `permissionGate` NO conservó el alcance: `hasAccess`
     * exigía `sync-assist` siempre, mientras `evaluate` corta antes en
     * `module-not-enforced` y concede a cualquier sesión del tenant. Hoy el
     * módulo está encendido —en la constante y en la siembra—, así que el hueco
     * no está abierto; este caso deja escrito qué pasa si alguien apaga el
     * interruptor en BD, en vez de dejarlo a la interpretación del lector.
     *
     * Solo se ejerce la vía POR EMPLEADO: su validador responde 422 sin salir a
     * la red. La general llamaría al equipo biométrico.
     */
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const previous = await setModuleEnforcement(MODULE, false)
    try {
      const response = await synchronizeEmployee(client, tenant)

      assertPassesGate(assert, response)
      response.assertStatus(422)
    } finally {
      await setModuleEnforcement(MODULE, previous)
    }
  })
})
