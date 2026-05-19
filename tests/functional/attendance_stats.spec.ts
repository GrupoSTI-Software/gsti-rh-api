import { test } from '@japa/runner'
import User from '#models/user'

/**
 * Tests funcionales — AttendanceStatsController
 * Rutas: /api/v1/attendance-stats/{overview,by-department,by-employee}
 *
 * Asumen que existe al menos un usuario con userBusinessAccess no vacío
 * en la BD de testing. Si no es así, los tests de 200 fallarán — pero
 * los de 400/401 cubren las validaciones que pidió la HU.
 */

test.group('AttendanceStats - validation & auth', () => {

  test('400 cuando falta startDay o endDay', async ({ client }) => {
    const user = await User.query().whereNull('user_deleted_at').firstOrFail()
    const response = await client
      .get('/api/v1/attendance-stats/overview')
      .qs({ endDay: '2026-05-17' })
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'error' })
  })

  test('400 cuando startDay > endDay', async ({ client }) => {
    const user = await User.query().whereNull('user_deleted_at').firstOrFail()
    const response = await client
      .get('/api/v1/attendance-stats/by-department')
      .qs({ startDay: '2026-05-17', endDay: '2026-05-11' })
      .loginAs(user)

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
    const user = await User.query()
      .whereNull('user_deleted_at')
      .whereNotNull('user_business_access')
      .firstOrFail()
    // Limitamos a 1 empleado: la nueva arquitectura llama syncAssistsService.index
    // per-empleado y para todo el scope tomaría >2 min. Para validar la forma del
    // response basta con un empleado.
    const response = await client
      .get('/api/v1/attendance-stats/overview')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(user)

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
  })

  test('200 by-department devuelve array', async ({ client, assert }) => {
    const user = await User.query()
      .whereNull('user_deleted_at')
      .whereNotNull('user_business_access')
      .firstOrFail()
    const response = await client
      .get('/api/v1/attendance-stats/by-department')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(user)

    response.assertStatus(200)
    assert.isArray(response.body().data)
  })

  test('200 by-employee devuelve array y respeta employeeIds', async ({ client, assert }) => {
    const user = await User.query()
      .whereNull('user_deleted_at')
      .whereNotNull('user_business_access')
      .firstOrFail()
    const response = await client
      .get('/api/v1/attendance-stats/by-employee')
      .qs({ startDay: '2026-05-11', endDay: '2026-05-17', employeeIds: '1' })
      .loginAs(user)

    response.assertStatus(200)
    assert.isArray(response.body().data)
    const rows = response.body().data
    if (rows.length > 0) {
      assert.equal(rows[0].employee.employeeId, 1)
    }
  })
})
