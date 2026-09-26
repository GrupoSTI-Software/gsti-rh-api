import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Assist from '#models/assist'
import Role from '#models/role'
import User from '#models/user'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
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

/** Lo llena el setup del grupo; los helpers de este archivo lo leen. */
let fixture: Fixture

const MODULE_SLUG = 'employees-attendance-monitor'
const CAPTURE_PERMISSION = 'add-assist-manual'

interface Fixture {
  actor: TenantActor
  employeeFixture: EmployeeFixture
  businessUnitId: number
  publicId: string
  employeeId: number
}

/**
 * Empresa, actor y colaborador propios del spec.
 *
 * Antes tomaba "el primer empleado con usuario en pivote" de la base, que en una
 * base recién sembrada no existe: el setup fallaba antes del primer caso. Armar
 * el suyo también le da al spec un rol que puede mover para probar el alcance.
 */
async function resolveFixture(): Promise<Fixture> {
  const actor = await createTenantActor('assist-window')
  await grantModulePermissions(actor, MODULE_SLUG, [CAPTURE_PERMISSION])

  const employeeFixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'window')

  return {
    actor,
    employeeFixture,
    businessUnitId: actor.businessUnit.businessUnitId,
    publicId: String(actor.businessUnit.businessUnitPublicId),
    employeeId: employeeFixture.employee.employeeId,
  }
}

async function getUserForBusinessUnit(_businessUnitId: number): Promise<User> {
  return fixture.actor.user
}

/** Rol del actor con su valor original, para devolverlo al terminar el caso. */
interface RoleScopeBackup {
  role: Role
  previousDays: number | null
}

/** Fija los días de alcance del rol del actor durante un caso. */
async function withRoleManagementDays(user: User, days: number | null): Promise<RoleScopeBackup> {
  const role = await Role.query().where('role_id', user.roleId).firstOrFail()
  const previousDays = role.roleManagementDays
  role.roleManagementDays = days
  await role.save()
  return { role, previousDays }
}

/** Devuelve el rol a los días que tenía antes del caso. */
async function restoreRoleManagementDays(backup: RoleScopeBackup): Promise<void> {
  backup.role.roleManagementDays = backup.previousDays
  await backup.role.save()
}

test.group('Assists — ventana de hora de captura (USRH1788135907803)', (group) => {
  group.setup(async () => {
    fixture = await resolveFixture()
  })

  group.teardown(async () => {
    if (createdAssistIds.size > 0) {
      await TenantContext.runUnscoped(async () => {
        await Assist.query()
          .withTrashed()
          .whereIn('assist_id', [...createdAssistIds])
          .delete()
      }, 'limpieza de fixtures de ventana de hora de captura')
    }

    if (fixture?.employeeId) {
      // El alta de una checada deja calendario clasificado colgado del
      // colaborador, y su FK impide borrarlo mientras exista.
      await db
        .from('employee_assist_calendars')
        .where('employee_id', fixture.employeeId)
        .delete()
    }

    await cleanupEmployeeFixture(fixture?.employeeFixture ?? null)
    await cleanupTenantActor(fixture?.actor ?? null)
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
        assistChannel: 'app',
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(422)
    assert.equal(response.body().code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW)
    assert.equal(response.body().key, 'hora-de-captura-fuera-de-la-ventana-permitida')
    assert.notMatch(response.body().detail, /\d+\s*(h|hora|hour)/i)
  })

  test('la captura desde el backoffice no se mide con la ventana del canal', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const role = await withRoleManagementDays(user, null)
    const stale = DateTime.utc().startOf('second').minus({ days: 30 })

    try {
      // El mismo instante que el canal de la app rechaza: quien corrige el pasado
      // desde el backoffice lo hace a propósito, y su rol no declara tope.
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

      response.assertStatus(201)
      const body = response.body()
      createdAssistIds.add(body.data.assist.assistId)
      assert.equal(
        DateTime.fromISO(body.data.assist.assistPunchTimeUtc, { zone: 'utc' }).toISO(),
        stale.toISO()
      )
    } finally {
      await restoreRoleManagementDays(role)
    }
  })

  test('el rol con días de alcance corta la captura administrativa más vieja', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const role = await withRoleManagementDays(user, 3)

    try {
      const outOfScope = await client
        .post('/api/v1/assists')
        .json({
          employeeId: fixture.employeeId,
          assistType: 'check',
          assistPunchTime: DateTime.utc().minus({ days: 10 }).toISO(),
          assistChannel: 'backoffice',
        })
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

      outOfScope.assertStatus(422)
      assert.equal(outOfScope.body().code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_ROLE_SCOPE)
      assert.equal(outOfScope.body().key, 'hora-de-captura-fuera-del-alcance-del-rol')

      // Dentro del alcance sí pasa, aunque quede muy por fuera de la ventana del canal.
      const inScope = await client
        .post('/api/v1/assists')
        .json({
          employeeId: fixture.employeeId,
          assistType: 'check',
          assistPunchTime: DateTime.utc().startOf('second').minus({ days: 2 }).toISO(),
          assistChannel: 'backoffice',
        })
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

      inScope.assertStatus(201)
      createdAssistIds.add(inScope.body().data.assist.assistId)
    } finally {
      await restoreRoleManagementDays(role)
    }
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

  test('el lote aplica el alcance del rol solo a los elementos del backoffice', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const role = await withRoleManagementDays(user, 3)
    const now = DateTime.utc().startOf('second')

    try {
      const response = await client
        .post('/api/v1/assists/batch')
        .json({
          assists: [
            {
              clientRef: 'captura-dentro-del-alcance',
              employeeId: fixture.employeeId,
              assistType: 'check',
              // Otra hora que la del caso suelto: la misma sería la misma checada.
              assistPunchTime: now.minus({ days: 1, hours: 7 }).toISO(),
              assistChannel: 'backoffice',
            },
            {
              clientRef: 'captura-fuera-del-alcance',
              employeeId: fixture.employeeId,
              assistType: 'check',
              assistPunchTime: now.minus({ days: 10 }).toISO(),
              assistChannel: 'backoffice',
            },
            {
              clientRef: 'equipo-fuera-de-la-ventana',
              employeeId: fixture.employeeId,
              assistType: 'check',
              assistPunchTime: now.minus({ days: 10 }).toISO(),
              assistChannel: 'kiosk',
            },
          ],
        })
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

      response.assertStatus(200)
      const results = response.body().data.results
      for (const result of results) {
        if (result.assistId) createdAssistIds.add(result.assistId)
      }

      // Dos días atrás rebasan la ventana del canal y aun así entran: el tope
      // de la captura administrativa son los tres días del rol.
      assert.equal(results[0].outcome, 'inserted')
      assert.equal(results[1].outcome, 'rejected')
      assert.equal(results[1].error.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_ROLE_SCOPE)
      // El mismo instante por un equipo sigue midiéndose con la ventana.
      assert.equal(results[2].outcome, 'rejected')
      assert.equal(results[2].error.code, ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW)
    } finally {
      await restoreRoleManagementDays(role)
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
