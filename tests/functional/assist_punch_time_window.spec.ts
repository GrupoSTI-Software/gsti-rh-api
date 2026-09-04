import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { TenantContext } from '#utils/tenant_context'
import {
  ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_CAP,
  ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_CAP,
  ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_MIN,
  getAssistPunchTimeFutureToleranceSeconds,
  getAssistPunchTimeMaxBackdateHours,
} from '#modules/assist-ingestion/assist_ingestion.constants'
import { resolvePunchTime } from '#modules/assist-ingestion/assist_ingestion.service'

/**
 * USRH1788135907803 — aceptar la hora en que se capturó la checada, dentro de una
 * ventana. Base de datos real para el camino HTTP; función pura para los bordes.
 */

const createdAssistIds = new Set<number>()

interface Fixture {
  businessUnitId: number
  publicId: string
  employeeId: number
}

async function resolveFixture(): Promise<Fixture> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .select('employee_id', 'business_unit_id')
  }, 'empleados para fixtures de ventana de hora de captura')

  for (const employee of employees) {
    if (!employee.businessUnitId) continue
    const pivot = await BusinessUnitUser.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    const businessUnit = await BusinessUnit.query()
      .where('businessUnitId', employee.businessUnitId)
      .first()
    if (!pivot || !businessUnit) continue

    return {
      businessUnitId: employee.businessUnitId,
      publicId: String(businessUnit.businessUnitPublicId),
      employeeId: employee.employeeId,
    }
  }

  throw new Error('Se requiere una unidad con empleado activo y usuario en pivote.')
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

test.group('Assists — ventana de hora de captura (USRH1788135907803)', (group) => {
  let fixture: Fixture

  group.setup(async () => {
    fixture = await resolveFixture()
  })

  group.teardown(async () => {
    if (createdAssistIds.size === 0) return
    await TenantContext.runUnscoped(async () => {
      await Assist.query()
        .withTrashed()
        .whereIn('assist_id', [...createdAssistIds])
        .delete()
    }, 'limpieza de fixtures de ventana de hora de captura')
  })

  test('la misma hora de pared en los dos formatos guarda el mismo instante', ({ assert }) => {
    const receivedAt = DateTime.fromISO('2026-08-30T15:10:00', { zone: 'utc' })

    const iso = resolvePunchTime('2026-08-28T18:02:00-06:00', receivedAt)
    const legacy = resolvePunchTime('2026-08-28 18:02:00', receivedAt)

    assert.isTrue(iso.ok)
    assert.isTrue(legacy.ok)
    if (!iso.ok || !legacy.ok) return

    assert.equal(iso.punchTimeUtc.toISO(), '2026-08-29T00:02:00.000Z')
    assert.equal(legacy.punchTimeUtc.toISO(), iso.punchTimeUtc.toISO())
    // Nadie gana ni pierde tiempo por la forma en que su equipo escriba la hora.
    assert.equal(legacy.deferredBySeconds, iso.deferredBySeconds)
  })

  test('una hora de captura ilegible se rechaza por forma', ({ assert }) => {
    const resolved = resolvePunchTime('30/08/2026 09:10', DateTime.utc())
    assert.isFalse(resolved.ok)
    if (resolved.ok) return
    assert.equal(resolved.rejection.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FORMAT)
    assert.equal(resolved.rejection.status, 400)
  })

  test('el borde de la tolerancia de futuro se acepta y un segundo más se rechaza', ({
    assert,
  }) => {
    const receivedAt = DateTime.utc()
    const tolerance = getAssistPunchTimeFutureToleranceSeconds()

    const atBorder = resolvePunchTime(
      receivedAt.plus({ seconds: tolerance }).toISO() as string,
      receivedAt
    )
    assert.isTrue(atBorder.ok, 'la comparación es estrictamente mayor que la tolerancia')
    if (atBorder.ok) {
      assert.isFalse(atBorder.deferred)
      assert.equal(atBorder.deferredBySeconds, 0)
    }

    const beyond = resolvePunchTime(
      receivedAt.plus({ seconds: tolerance + 1 }).toISO() as string,
      receivedAt
    )
    assert.isFalse(beyond.ok)
    if (!beyond.ok) {
      assert.equal(beyond.rejection.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FUTURE)
      assert.equal(beyond.rejection.status, 422)
    }
  })

  test('el borde de la ventana hacia atrás se acepta y una hora más se rechaza', ({ assert }) => {
    const receivedAt = DateTime.utc()
    const windowSeconds = getAssistPunchTimeMaxBackdateHours() * 3600

    const atBorder = resolvePunchTime(
      receivedAt.minus({ seconds: windowSeconds }).toISO() as string,
      receivedAt
    )
    assert.isTrue(atBorder.ok)
    if (atBorder.ok) {
      assert.isTrue(atBorder.deferred)
      assert.equal(atBorder.deferredBySeconds, windowSeconds)
    }

    const beyond = resolvePunchTime(
      receivedAt.minus({ seconds: windowSeconds + 3600 }).toISO() as string,
      receivedAt
    )
    assert.isFalse(beyond.ok)
    if (!beyond.ok) {
      assert.equal(beyond.rejection.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW)
      assert.equal(beyond.rejection.status, 422)
    }
  })

  test('sin hora declarada se usa el reloj del servidor y no se evalúa la ventana', ({
    assert,
  }) => {
    const receivedAt = DateTime.utc()
    for (const declared of [undefined, null, '']) {
      const resolved = resolvePunchTime(declared, receivedAt)
      assert.isTrue(resolved.ok)
      if (!resolved.ok) continue
      assert.equal(resolved.punchTimeUtc.toISO(), receivedAt.toUTC().toISO())
      assert.isFalse(resolved.deferred)
    }
  })

  test('una checada en línea no se marca diferida y una encolada sí', ({ assert }) => {
    const receivedAt = DateTime.utc()

    const online = resolvePunchTime(receivedAt.minus({ seconds: 2 }).toISO() as string, receivedAt)
    assert.isTrue(online.ok)
    if (online.ok) {
      assert.isFalse(online.deferred)
      assert.equal(online.deferredBySeconds, 2)
    }

    const queued = resolvePunchTime(receivedAt.minus({ hours: 6 }).toISO() as string, receivedAt)
    assert.isTrue(queued.ok)
    if (queued.ok) {
      assert.isTrue(queued.deferred)
      assert.equal(queued.deferredBySeconds, 21_600)
    }
  })

  test('una configuración fuera de rango se satura al tope del producto', ({ assert }) => {
    const hours = getAssistPunchTimeMaxBackdateHours()
    const tolerance = getAssistPunchTimeFutureToleranceSeconds()

    assert.isAtLeast(hours, ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_MIN)
    assert.isAtMost(hours, ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_CAP)
    assert.isAtLeast(tolerance, 0)
    assert.isAtMost(tolerance, ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_CAP)

    env.set('ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS', '8760')
    env.set('ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS', '99999')
    try {
      // Una configuración absurda se recorta y el registro de checadas no se detiene.
      assert.equal(getAssistPunchTimeMaxBackdateHours(), ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_CAP)
      assert.equal(
        getAssistPunchTimeFutureToleranceSeconds(),
        ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_CAP
      )
    } finally {
      env.set('ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS', String(hours))
      env.set('ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS', String(tolerance))
    }
  })

  test('el alta unitaria conserva la hora declarada y dice si llegó diferida', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const punchTime = DateTime.utc().startOf('second').minus({ hours: 5, seconds: 7 })

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: punchTime.toISO(),
        assistChannel: 'app',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(201)
    const body = response.body()
    createdAssistIds.add(body.data.assist.assistId)

    // La hora que cuenta es la del marcaje, no la del momento en que se logró entregar.
    assert.equal(
      DateTime.fromISO(body.data.assist.assistPunchTimeUtc, { zone: 'utc' }).toISO(),
      punchTime.toISO()
    )
    assert.isTrue(body.data.deferred)
    assert.isAbove(body.data.deferredBySeconds, 17_000)
  })

  test('una hora fuera de la ventana se rechaza sin decir cuánto es la ventana', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const stale = DateTime.utc().minus({ days: 30 })

    const response = await client
      .post('/api/v1/assists')
      .json({
        employeeId: fixture.employeeId,
        assistType: 'check',
        assistPunchTime: stale.toISO(),
        assistChannel: 'backoffice',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(422)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW)
    assert.equal(response.body().key, 'hora-de-captura-fuera-de-la-ventana-permitida')
    assert.notMatch(response.body().detail, /\d+\s*(h|hora|hour)/i)
  })

  test('una hora futura se rechaza también en la captura administrativa', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const ahead = DateTime.utc().plus({ hours: 1 })

    for (const assistChannel of ['app', 'kiosk', 'backoffice']) {
      const response = await client
        .post('/api/v1/assists')
        .json({
          employeeId: fixture.employeeId,
          assistType: 'check',
          assistPunchTime: ahead.toISO(),
          assistChannel,
        })
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

      response.assertStatus(422)
      assert.equal(
        response.body().code,
        ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FUTURE,
        `el canal ${assistChannel} no tiene margen propio`
      )
    }
  })

  test('la entrega en lote juzga la hora por elemento', async ({ client, assert }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const now = DateTime.utc().startOf('second')

    const response = await client
      .post('/api/v1/assists/batch')
      .json({
        assists: [
          {
            clientRef: 'dentro',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: now.minus({ hours: 3, seconds: 11 }).toISO(),
            assistChannel: 'kiosk',
          },
          {
            clientRef: 'futura',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: now.plus({ hours: 2 }).toISO(),
            assistChannel: 'kiosk',
          },
          {
            clientRef: 'antigua',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: now.minus({ days: 30 }).toISO(),
            assistChannel: 'kiosk',
          },
        ],
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(200)
    const body = response.body()
    for (const result of body.data.results) {
      if (result.assistId) createdAssistIds.add(result.assistId)
    }

    assert.equal(body.data.results[0].outcome, 'inserted')
    assert.isTrue(body.data.results[0].deferred)
    assert.equal(body.data.results[1].outcome, 'rejected')
    assert.equal(body.data.results[1].error.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FUTURE)
    assert.equal(body.data.results[2].outcome, 'rejected')
    assert.equal(body.data.results[2].error.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW)
  })

  test('la ventana no se publica en la configuración activa', async ({ client, assert }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .get('/api/system-settings-active')
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    const serialized = JSON.stringify(response.body()).toLowerCase()
    assert.notInclude(serialized, 'backdate')
    assert.notInclude(serialized, 'punchtimewindow')
    assert.notInclude(serialized, 'futuretolerance')
  })
})
