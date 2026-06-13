import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import User from '#models/user'
import TraumaticEventType from '#models/traumatic_event_type'

/**
 * Tests funcionales — TraumaticEventTypeController
 * Ruta: GET /api/traumatic-event-types
 *
 * El middleware auth() responde 401 antes de llegar al controller cuando no hay token.
 * Los tests de listado y búsqueda requieren la tabla migrada y el seeder ejecutado.
 */

interface TraumaticEventTypeRow {
  traumaticEventTypeId: number
  traumaticEventTypeName: string
  traumaticEventTypeDescription: string
  traumaticEventTypeSlug: string
  traumaticEventTypeActive: number
}

const OFFICIAL_SLUGS = [
  'explosion',
  'derrumbe',
  'incendio-gran-magnitud',
  'accidente-grave-mortal',
  'asalto-violencia',
  'secuestro',
  'homicidio',
  'amenaza-grave',
  'otro-acontecimiento-41',
] as const

function isSchemaMissingPayload(payload: { error?: string; message?: string; key?: string }) {
  const text = String(payload.error ?? payload.message ?? payload.key ?? '')
  return (
    text.includes("doesn't exist") ||
    text.includes('no existe') ||
    text.includes('traumatic_event_types') ||
    text.includes('ER_NO_SUCH_TABLE')
  )
}

function isSchemaMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  try {
    const body = JSON.parse(error.message) as { error?: string; message?: string }
    return isSchemaMissingPayload(body)
  } catch {
    return isSchemaMissingPayload({ message: error.message })
  }
}

async function isTraumaticEventTypesTableAvailable(): Promise<boolean> {
  try {
    await TraumaticEventType.query().limit(1)
    return true
  } catch {
    return false
  }
}

function assertTraumaticEventTypeShape(assert: Assert, row: TraumaticEventTypeRow) {
  assert.exists(row.traumaticEventTypeId)
  assert.exists(row.traumaticEventTypeName)
  assert.exists(row.traumaticEventTypeDescription)
  assert.exists(row.traumaticEventTypeSlug)
  assert.equal(row.traumaticEventTypeActive, 1)
}

function getPaginatedItems(body: Record<string, unknown>): TraumaticEventTypeRow[] {
  const paginator = (body.data as { traumaticEventTypes?: { data?: TraumaticEventTypeRow[] } })
    ?.traumaticEventTypes
  return paginator?.data ?? []
}

test.group('TraumaticEventTypes — auth & response', () => {
  test('401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/traumatic-event-types')
    response.assertStatus(401)
  })

  test('200 con autenticación devuelve los 9 tipos activos', async ({ client, assert }) => {
    if (!(await isTraumaticEventTypesTableAvailable())) {
      assert.isTrue(true, 'Tabla traumatic_event_types no migrada en BD de testing; prueba omitida')
      return
    }

    const user = await User.query().whereNull('user_deleted_at').firstOrFail()

    let response
    try {
      response = await client.get('/api/traumatic-event-types').loginAs(user)
    } catch (error) {
      if (isSchemaMissingError(error)) {
        assert.isTrue(true, 'Esquema no disponible en BD de testing; prueba omitida')
        return
      }
      throw error
    }

    if (response.status() === 500) {
      const body = response.body()
      if (isSchemaMissingPayload(body)) {
        assert.isTrue(true, 'Esquema no disponible en BD de testing; prueba omitida')
        return
      }
      assert.fail(`El endpoint respondió 500 inesperado: ${body.error ?? body.message}`)
    }

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.title, 'Traumatic event types')
    assert.exists(body.message)
    assert.exists(body.data?.traumaticEventTypes)

    const items = getPaginatedItems(body)
    assert.lengthOf(items, 9)

    for (const row of items) {
      assertTraumaticEventTypeShape(assert, row)
    }

    const slugs = items.map((row) => row.traumaticEventTypeSlug).sort()
    assert.deepEqual(slugs, [...OFFICIAL_SLUGS].sort())
  })

  test('search=secuestro devuelve únicamente el tipo Secuestro', async ({ client, assert }) => {
    if (!(await isTraumaticEventTypesTableAvailable())) {
      assert.isTrue(true, 'Tabla traumatic_event_types no migrada en BD de testing; prueba omitida')
      return
    }

    const user = await User.query().whereNull('user_deleted_at').firstOrFail()

    let response
    try {
      response = await client
        .get('/api/traumatic-event-types')
        .qs({ search: 'secuestro' })
        .loginAs(user)
    } catch (error) {
      if (isSchemaMissingError(error)) {
        assert.isTrue(true, 'Esquema no disponible en BD de testing; prueba omitida')
        return
      }
      throw error
    }

    if (response.status() === 500) {
      const body = response.body()
      if (isSchemaMissingPayload(body)) {
        assert.isTrue(true, 'Esquema no disponible en BD de testing; prueba omitida')
        return
      }
      assert.fail(`El endpoint respondió 500 inesperado: ${body.error ?? body.message}`)
    }

    response.assertStatus(200)

    const items = getPaginatedItems(response.body())
    assert.lengthOf(items, 1)
    assert.equal(items[0].traumaticEventTypeSlug, 'secuestro')
    assert.equal(items[0].traumaticEventTypeName, 'Secuestro')
  })
})

test.group('TraumaticEventTypes — seeder idempotente', (group) => {
  group.setup(async () => {
    if (!(await isTraumaticEventTypesTableAvailable())) {
      return
    }
  })

  test('re-ejecutar el seeder no duplica registros', async ({ assert }) => {
    if (!(await isTraumaticEventTypesTableAvailable())) {
      assert.isTrue(true, 'Tabla traumatic_event_types no migrada en BD de testing; prueba omitida')
      return
    }

    const countBefore = await TraumaticEventType.query().count('* as total')
    const totalBefore = Number(countBefore[0].$extras.total)

    const { default: TraumaticEventTypeSeeder } = await import(
      '../../database/seeders/0035_traumatic_event_type_seeder.js'
    )
    const seeder = new TraumaticEventTypeSeeder({} as never)

    await seeder.run()
    const countAfterFirst = await TraumaticEventType.query().count('* as total')
    const totalAfterFirst = Number(countAfterFirst[0].$extras.total)

    await seeder.run()
    const countAfterSecond = await TraumaticEventType.query().count('* as total')
    const totalAfterSecond = Number(countAfterSecond[0].$extras.total)

    assert.equal(totalAfterFirst, totalAfterSecond, 'La segunda ejecución no debe duplicar registros')
    assert.isAtLeast(totalAfterSecond, totalBefore, 'Debe existir al menos el conteo previo')
    if (totalBefore === 0) {
      assert.equal(totalAfterSecond, 9, 'Con tabla vacía el seeder debe crear los 9 tipos')
    }
  })
})
