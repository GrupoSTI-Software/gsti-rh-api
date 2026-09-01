import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { TenantContext } from '#utils/tenant_context'
import { ASSIST_INGESTION_BATCH_MAX_ITEMS } from '#modules/assist-ingestion/assist_ingestion.constants'
import { assistIngestionCalendarRanges } from '#modules/assist-ingestion/assist_ingestion.service'
import type { AssistIngestionPersisted } from '#modules/assist-ingestion/dto/assist_ingestion.dto'

/**
 * USRH1788135907802 — entregar varias checadas juntas con veredicto por cada una.
 * Base de datos real.
 */

const NON_EXISTENT_EMPLOYEE_ID = 2_147_483_641
const createdAssistIds = new Set<number>()

interface Fixture {
  businessUnitId: number
  publicId: string
  employeeId: number
  foreignEmployeeId: number | null
}

async function resolveFixture(): Promise<Fixture> {
  const employees = await TenantContext.runUnscoped(async () => {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('business_unit_id')
      .select('employee_id', 'business_unit_id')
  }, 'empleados para fixtures de entrega en lote')

  const byUnit = new Map<number, number>()
  for (const row of employees) {
    if (row.businessUnitId && !byUnit.has(row.businessUnitId)) {
      byUnit.set(row.businessUnitId, row.employeeId)
    }
  }

  for (const [businessUnitId, employeeId] of byUnit) {
    const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).first()
    const businessUnit = await BusinessUnit.query().where('businessUnitId', businessUnitId).first()
    if (!pivot || !businessUnit) continue

    const foreignUnitId = [...byUnit.keys()].find((id) => id !== businessUnitId) ?? null

    return {
      businessUnitId,
      publicId: String(businessUnit.businessUnitPublicId),
      employeeId,
      foreignEmployeeId: foreignUnitId ? byUnit.get(foreignUnitId)! : null,
    }
  }

  throw new Error('Se requiere una unidad con empleado activo y usuario en pivote.')
}

async function getUserForBusinessUnit(businessUnitId: number): Promise<User> {
  const pivot = await BusinessUnitUser.query().where('businessUnitId', businessUnitId).firstOrFail()
  return User.query().whereNull('user_deleted_at').where('user_id', pivot.userId).firstOrFail()
}

function uniquePunchTime(offsetSeconds: number): string {
  const seed = Math.floor(Date.now() / 1000) % 86_400
  return DateTime.fromISO('2026-02-12T08:00:00', { zone: 'utc' })
    .plus({ seconds: seed + offsetSeconds })
    .toFormat('yyyy-MM-dd HH:mm:ss')
}

function trackCreated(body: { data: { results: Array<{ assistId?: number }> } }): void {
  for (const result of body.data.results) {
    if (result.assistId) createdAssistIds.add(result.assistId)
  }
}

test.group('Assists — entrega de varias checadas (USRH1788135907802)', (group) => {
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
    }, 'limpieza de fixtures de entrega en lote')
  })

  test('la entrega devuelve un veredicto por checada, en orden y con su referencia', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const repeated = uniquePunchTime(0)

    const response = await client
      .post('/api/v1/assists/batch')
      .json({
        assists: [
          {
            clientRef: 'ref-0',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: repeated,
            assistChannel: 'kiosk',
          },
          {
            clientRef: 'ref-1',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: uniquePunchTime(1),
            assistChannel: 'kiosk',
          },
          {
            clientRef: 'ref-2',
            employeeId: NON_EXISTENT_EMPLOYEE_ID,
            assistType: 'check',
            assistPunchTime: uniquePunchTime(2),
            assistChannel: 'kiosk',
          },
          {
            // Gemelo intra-lote del elemento 0: mismo colaborador, instante y canal.
            clientRef: 'ref-3',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: repeated,
            assistChannel: 'kiosk',
          },
        ],
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(200)
    const body = response.body()
    trackCreated(body)

    assert.equal(body.data.summary.received, 4)
    assert.deepEqual(
      body.data.results.map((result: { index: number }) => result.index),
      [0, 1, 2, 3]
    )
    assert.deepEqual(
      body.data.results.map((result: { clientRef: string }) => result.clientRef),
      ['ref-0', 'ref-1', 'ref-2', 'ref-3']
    )

    assert.equal(body.data.results[0].outcome, 'inserted')
    assert.equal(body.data.results[1].outcome, 'inserted')

    // Un elemento malo no tumba la entrega: recibe su motivo y los demás siguen.
    assert.equal(body.data.results[2].outcome, 'rejected')
    assert.oneOf(body.data.results[2].error.code, [
      ASSIST_ERROR_CODES.VAL_EMPLOYEE_NOT_FOUND,
      ASSIST_ERROR_CODES.AUTHZ_FOREIGN_WRITE,
    ])

    // El gemelo se rechaza en vez de colapsarse en silencio a "ya estaba".
    assert.equal(body.data.results[3].outcome, 'rejected')
    assert.equal(body.data.results[3].error.code, ASSIST_ERROR_CODES.VAL_BATCH_DUPLICATE_ITEM)
    assert.equal(body.data.results[3].error.key, 'checada-repetida-dentro-del-lote')
    assert.isUndefined(body.data.results[3].assistId)

    assert.equal(body.data.summary.inserted, 2)
    assert.equal(body.data.summary.rejected, 2)
    assert.equal(body.data.summary.acknowledged, 2)
    assert.isString(body.data.serverTime)
  })

  test('una checada ya registrada vuelve como preexistente y no se escribe otra vez', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)
    const punchTime = uniquePunchTime(600)
    const payload = {
      assists: [
        {
          clientRef: 'ref-repetida',
          employeeId: fixture.employeeId,
          assistType: 'check',
          assistPunchTime: punchTime,
          assistChannel: 'kiosk',
        },
      ],
    }

    const send = () =>
      client
        .post('/api/v1/assists/batch')
        .json(payload)
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

    const first = await send()
    first.assertStatus(200)
    trackCreated(first.body())

    const second = await send()
    second.assertStatus(200)
    trackCreated(second.body())

    assert.equal(first.body().data.results[0].outcome, 'inserted')
    assert.equal(second.body().data.results[0].outcome, 'preexisting')
    assert.equal(
      second.body().data.results[0].assistId,
      first.body().data.results[0].assistId
    )
    assert.equal(second.body().data.summary.acknowledged, 1)
    assert.equal(second.body().data.summary.inserted, 0)
  })

  test('el sobre mal formado detiene la entrega completa y no registra nada', async ({
    client,
    assert,
  }) => {
    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const send = (payload: Record<string, unknown>) =>
      client
        .post('/api/v1/assists/batch')
        .json(payload)
        .loginAs(user)
        .header('X-Business-Unit-Id', fixture.publicId)

    const empty = await send({ assists: [] })
    empty.assertStatus(400)
    assert.equal(empty.body().code, ASSIST_ERROR_CODES.VAL_BATCH_SIZE)
    assert.equal(empty.body().key, 'lote-de-checadas-fuera-de-tamano')

    const missing = await send({})
    missing.assertStatus(400)
    assert.equal(missing.body().code, ASSIST_ERROR_CODES.VAL_BATCH_SIZE)

    const notAnArray = await send({ assists: 'muchas' })
    notAnArray.assertStatus(400)
    assert.equal(notAnArray.body().code, ASSIST_ERROR_CODES.VAL_BATCH_SIZE)

    const tooMany = await send({
      assists: Array.from({ length: ASSIST_INGESTION_BATCH_MAX_ITEMS + 1 }, () => ({
        employeeId: fixture.employeeId,
        assistType: 'check',
      })),
    })
    tooMany.assertStatus(400)
    assert.equal(tooMany.body().code, ASSIST_ERROR_CODES.VAL_BATCH_SIZE)
  })

  test('el permiso se resuelve por elemento y no se extrapola del primero', async ({
    client,
    assert,
  }) => {
    if (!fixture.foreignEmployeeId) {
      assert.isTrue(true, 'sin segunda empresa con empleado activo: escenario no aplicable')
      return
    }

    const user = await getUserForBusinessUnit(fixture.businessUnitId)

    const response = await client
      .post('/api/v1/assists/batch')
      .json({
        assists: [
          {
            clientRef: 'propio',
            employeeId: fixture.employeeId,
            assistType: 'check',
            assistPunchTime: uniquePunchTime(900),
            assistChannel: 'kiosk',
          },
          {
            clientRef: 'ajeno',
            employeeId: fixture.foreignEmployeeId,
            assistType: 'check',
            assistPunchTime: uniquePunchTime(901),
            assistChannel: 'kiosk',
          },
        ],
      })
      .loginAs(user)
      .header('X-Business-Unit-Id', fixture.publicId)

    response.assertStatus(200)
    const body = response.body()
    trackCreated(body)

    assert.equal(body.data.results[0].outcome, 'inserted')
    assert.equal(body.data.results[1].outcome, 'rejected')
    assert.oneOf(body.data.results[1].error.code, [
      ASSIST_ERROR_CODES.VAL_EMPLOYEE_NOT_FOUND,
      ASSIST_ERROR_CODES.AUTHZ_FOREIGN_WRITE,
    ])

    const foreignRows = await TenantContext.runUnscoped(async () => {
      return Assist.query()
        .withTrashed()
        .where('assist_emp_id', fixture.foreignEmployeeId as number)
        .whereNotIn('assist_id', [...createdAssistIds, 0])
        .whereRaw('assist_created_at >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)')
    }, 'verificación de que no se escribió la checada ajena')

    assert.lengthOf(foreignRows, 0)
  })

  test('el recálculo de calendario se agrupa por colaborador y no ocurre en colisiones', ({
    assert,
  }) => {
    const punchAt = (isoSeconds: string) => DateTime.fromISO(isoSeconds, { zone: 'utc' })
    const row = (
      index: number,
      outcome: 'inserted' | 'preexisting',
      employeeId: number,
      punch: string
    ): AssistIngestionPersisted => ({
      index,
      outcome,
      assist: {
        assistEmpId: employeeId,
        assistPunchTimeUtc: punchAt(punch),
      } as Assist,
    })

    const ranges = assistIngestionCalendarRanges([
      row(0, 'inserted', 10, '2026-02-10T08:00:00'),
      row(1, 'inserted', 10, '2026-02-12T18:00:00'),
      row(2, 'inserted', 11, '2026-02-11T09:00:00'),
      row(3, 'preexisting', 12, '2026-02-11T09:00:00'),
    ])

    // Dos colaboradores con checadas nuevas: dos rangos. El de la colisión, ninguno.
    assert.deepEqual([...ranges.keys()].sort(), [10, 11])
    assert.equal(ranges.get(10)!.from.toISO(), punchAt('2026-02-10T08:00:00').toISO())
    assert.equal(ranges.get(10)!.to.toISO(), punchAt('2026-02-12T18:00:00').toISO())
    assert.isUndefined(ranges.get(12))

    assert.equal(assistIngestionCalendarRanges([row(0, 'preexisting', 10, '2026-02-10T08:00:00')]).size, 0)
  })
})
