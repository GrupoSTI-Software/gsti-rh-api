import { test } from '@japa/runner'
import User from '#models/user'
import BusinessAccessScopeService from '#services/business_access_scope_service'

/**
 * Tests funcionales — AttendanceStatsController
 * Rutas: /api/v1/attendance-stats/{overview,by-department,by-employee}
 *
 * Asumen que existe al menos un usuario con userBusinessAccess no vacío
 * en la BD de testing. Si no es así, los tests de 200 fallarán — pero
 * los de 400/401 cubren las validaciones que pidió la HU.
 */

test.group('AttendanceStats - validation & auth', () => {
  async function getScopedUser() {
    const user = await User.query()
      .whereNull('user_deleted_at')
      .whereHas('role', (roleQuery) => {
        roleQuery.where('role_slug', 'root')
      })
      .preload('role')
      .firstOrFail()

    const scopeIds = await new BusinessAccessScopeService().getAccessibleIds(user)
    if (scopeIds.length === 0) {
      throw new Error('Se requiere al menos una business unit accesible para ejecutar attendance_stats.spec')
    }

    return { user, businessUnitId: scopeIds[0] }
  }

  test('400 cuando falta startDay o endDay', async ({ client }) => {
    const ctx = await getScopedUser()
    const response = await client
      .get('/api/v1/attendance-stats/overview')
      .qs({ endDay: '2026-05-17' })
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(400)
    response.assertBodyContains({ key: 'entrada-invalida' })
  })

  test('400 cuando startDay > endDay', async ({ client }) => {
    const ctx = await getScopedUser()
    const response = await client
      .get('/api/v1/attendance-stats/by-department')
      .qs({ startDay: '2026-05-17', endDay: '2026-05-11' })
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(400)
    response.assertBodyContains({ key: 'rango-invalido' })
  })

  test('401 sin autenticación', async ({ client }) => {
    const response = await client
      .get('/api/v1/attendance-stats/overview')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17' })

    response.assertStatus(401)
  })

  test('200 overview devuelve la forma esperada', async ({ client, assert }) => {
    const ctx = await getScopedUser()
    // Limitamos a 1 empleado: la nueva arquitectura llama syncAssistsService.index
    // per-empleado y para todo el scope tomaría >2 min. Para validar la forma del
    // response basta con un empleado.
    const response = await client
      .get('/api/v1/attendance-stats/overview')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data?.statistics)
    assert.exists(body.data?.period?.evaluableDays)
    const stats = body.data.statistics
    assert.exists(stats.ontimePercentage)
    assert.exists(stats.tolerancePercentage)
    assert.exists(stats.delayPercentage)
    assert.exists(stats.earlyOutPercentage)
    assert.exists(stats.faultPercentage)
    assert.exists(stats.totalAvailable)
    assert.equal(typeof stats.assists, 'number')
    assert.equal(typeof stats.tolerances, 'number')
    assert.equal(typeof stats.delays, 'number')
    assert.equal(typeof stats.faults, 'number')
    assert.equal(typeof stats.earlyOuts, 'number')
    assert.equal(typeof stats.employeesQty, 'number')

    // Desglose diario: un objeto por cada día del rango [startDay, endDay] inclusive.
    assert.isArray(body.data?.daily)
    assert.lengthOf(body.data.daily, 7)
    assert.equal(body.data.daily[0].day, '2026-05-11')
    assert.equal(body.data.daily[6].day, '2026-05-17')
    assert.exists(body.data.daily[0].statistics?.totalAvailable)
    assert.equal(typeof body.data.daily[0].statistics.employeesQty, 'number')
  })

  test('200 by-department devuelve array', async ({ client, assert }) => {
    const ctx = await getScopedUser()
    const response = await client
      .get('/api/v1/attendance-stats/by-department')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(200)
    assert.isArray(response.body().data)
    const deptRows = response.body().data
    if (deptRows.length > 0) {
      // `employeesQty` cuenta empleados con al menos un día evaluable, igual
      // que el overview: por eso nunca excede el total de filas del período.
      assert.equal(typeof deptRows[0].statistics.employeesQty, 'number')
      assert.isAtLeast(deptRows[0].statistics.employeesQty, 0)
    }
  })

  test('200 by-employee devuelve array y respeta employeeIds', async ({ client, assert }) => {
    const ctx = await getScopedUser()
    const response = await client
      .get('/api/v1/attendance-stats/by-employee')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    response.assertStatus(200)
    assert.isArray(response.body().data)
    const rows = response.body().data
    if (rows.length > 0) {
      assert.equal(rows[0].employee.employeeId, 1)
    }
  })
})
