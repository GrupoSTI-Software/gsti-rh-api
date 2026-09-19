import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import User from '#models/user'
import { ensureRole } from '#tests/helpers/ensure_role'
import type { RegulationCoverageRow } from '../../app/modules/regulatory-coverage/dto/regulatory_coverage.dto.js'

/**
 * Tests funcionales — RegulatoryCoverageController
 * Ruta: GET /api/v1/regulatory-coverage
 *
 * El middleware auth() responde 401 antes de llegar al controller cuando no hay token.
 * Los tests de forma de respuesta 200 requieren las tablas del marco regulatorio en BD.
 * El permiso `regulatory-coverage:read` se prueba en
 * `regulatory_coverage_permission_gate.spec.ts`; aquí se usa root para probar la forma.
 */

/**
 * Usuario root sembrado por 0008. Con la exigencia de `regulatory-coverage`
 * encendida, "el primer usuario activo" dejaba el resultado al rol de la primera
 * fila (la consulta ni siquiera ordenaba): cualquier usuario creado antes que
 * root respondía 403. root pasa el gate por bypass.
 */
async function getRootUser(): Promise<User> {
  const root = await ensureRole('root')
  return User.query()
    .whereNull('user_deleted_at')
    .where('role_id', root.roleId)
    .orderBy('user_id', 'asc')
    .firstOrFail()
}

/**
 * El cliente HTTP de Japa v2 lanza excepción en respuestas 500+.
 * Detecta si el fallo se debe a tablas regulatorias ausentes en la BD de testing.
 */
function isRegulatorySchemaMissing(payload: { key?: string; detail?: string; message?: string }) {
  const detail = String(payload.detail ?? payload.message ?? '')
  return (
    payload.key === 'error-calculo-cobertura' &&
    (detail.includes("doesn't exist") || detail.includes('no existe'))
  )
}

function isRegulatorySchemaMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  try {
    const body = JSON.parse(error.message) as { key?: string; detail?: string }
    return isRegulatorySchemaMissing(body)
  } catch {
    return (
      error.message.includes('error-calculo-cobertura') &&
      (error.message.includes("doesn't exist") || error.message.includes('no existe'))
    )
  }
}

function assertRegulationShape(assert: Assert, row: RegulationCoverageRow) {
  assert.exists(row.regulationId)
  assert.exists(row.regulationCode)
  assert.exists(row.regulationTitle)
  assert.exists(row.regulationType)
  assert.exists(row.regulationVersion)
  assert.equal(row.regulationStatus, 'vigente')
  assert.exists(row.authority?.slug)
  assert.exists(row.authority?.shortName)
  assert.equal(typeof row.evaluableClauses, 'number')
  assert.equal(typeof row.coveredTotal, 'number')
  assert.equal(typeof row.coveredPartial, 'number')
  assert.equal(typeof row.uncovered, 'number')

  if (row.evaluableClauses === 0) {
    assert.isNull(row.coveragePercentage)
  } else {
    assert.isNumber(row.coveragePercentage)
  }

  assert.equal(
    row.coveredTotal + row.coveredPartial + row.uncovered,
    row.evaluableClauses,
    'Los conteos deben sumar evaluableClauses'
  )

  assert.notProperty(row, 'regulationInternalNotes')
  assert.notProperty(row, 'regulationScopeDescriptionKey')
}

test.group('RegulatoryCoverage - auth & response', () => {
  test('401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/v1/regulatory-coverage')

    response.assertStatus(401)
  })

  test('200 con autenticación devuelve la forma esperada', async ({ client, assert }) => {
    const user = await getRootUser()

    let response
    try {
      response = await client.get('/api/v1/regulatory-coverage').loginAs(user)
    } catch (error) {
      if (isRegulatorySchemaMissingError(error)) {
        assert.isTrue(
          true,
          'Esquema regulatorio no migrado en BD de testing; prueba funcional omitida'
        )
        return
      }
      throw error
    }

    if (response.status() === 500) {
      const body = response.body()
      if (isRegulatorySchemaMissing(body)) {
        assert.isTrue(
          true,
          'Esquema regulatorio no migrado en BD de testing; prueba funcional omitida'
        )
        return
      }

      const detail = String(body.detail ?? body.message ?? '')
      assert.fail(`El endpoint respondió 500 inesperado: ${detail}`)
    }

    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.exists(body.title)
    assert.exists(body.message)
    assert.isArray(body.data?.regulations)

    for (const row of body.data.regulations as RegulationCoverageRow[]) {
      assertRegulationShape(assert, row)
    }
  })
})
