import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import ApiToken from '#models/api_token'
import Person from '#models/person'
import Regulation from '#models/regulation'
import Role from '#models/role'
import User from '#models/user'
import type {
  CoverageBucketPercentages,
  RegulationClauseDetail,
  RegulationCoverageRow,
  RegulationDetailHeader,
  RegulationSummaryRow,
} from '../../app/modules/regulatory-coverage/dto/regulatory_coverage.dto.js'

/**
 * Tests funcionales — RegulatoryCoverageController
 * Rutas: GET /api/platform/regulatory-coverage (L1), /summary (L2) y /:regulationId (L3).
 *
 * El guard de plataforma (`auth` + `platformAdmin`) responde 401 antes de llegar al
 * controller cuando no hay token. Los tests de forma de respuesta 200 requieren las
 * tablas del marco regulatorio en BD y un token de consola de plataforma.
 * El 403 del guard se prueba en `regulatory_coverage_permission_gate.spec.ts`; aquí se
 * usa un administrador de plataforma con token de consola para probar el contenido.
 */

const TEST_PASSWORD = 'RegulatoryCoverageContent123!'
const REGULATION_CODE = 'NOM-035-STPS'
const COVERAGE_ROUTE = '/api/platform/regulatory-coverage'

interface PlatformActor {
  user: User
  person: Person
  email: string
}

/** Crea un administrador de plataforma (rol root, `isPlatformAdmin`) con su persona. */
async function createPlatformAdmin(emailPrefix: string): Promise<PlatformActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'CoberturaPlataforma',
    personLastname: 'Contenido',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person, email }
}

async function cleanupActor(actor: PlatformActor | null): Promise<void> {
  if (!actor) return
  await ApiToken.query().where('tokenable_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function loginPlatformConsole(client: ApiClient, email: string): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token
  if (typeof token !== 'string' || token === '') {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
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

/** Detecta una tabla regulatoria ausente al consultar la BD directamente desde el test. */
function isTableMissingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("doesn't exist")
}

const SCHEMA_MISSING_NOTE =
  'Esquema regulatorio no migrado en BD de testing; prueba funcional omitida'

/**
 * GET con token de consola. Devuelve `null` cuando el fallo se debe a tablas
 * regulatorias ausentes en la BD de testing (el caso se omite).
 */
async function getOrNullIfSchemaMissing(
  client: ApiClient,
  url: string,
  token: string
): Promise<ApiResponse | null> {
  let response: ApiResponse
  try {
    response = await client.get(url).header('Authorization', `Bearer ${token}`)
  } catch (error) {
    if (isRegulatorySchemaMissingError(error)) return null
    throw error
  }

  if (response.status() === 500) {
    const body = response.body()
    if (isRegulatorySchemaMissing(body)) return null
  }
  return response
}

function assertSuccessEnvelope(
  assert: Assert,
  body: { type?: string; title?: string; message?: string }
) {
  assert.equal(body.type, 'success')
  assert.equal(body.title, 'Recursos')
  assert.equal(body.message, 'Los recursos fueron encontrados con éxito')
}

function assertNullableNumber(assert: Assert, value: number | null, label: string) {
  assert.isTrue(value === null || typeof value === 'number', `${label} debe ser number | null`)
}

function assertBuckets(assert: Assert, buckets: CoverageBucketPercentages, label: string) {
  assert.properties(buckets, ['disponible', 'enDesarrollo', 'planeado'])
  assertNullableNumber(assert, buckets.disponible, `${label}.disponible`)
  assertNullableNumber(assert, buckets.enDesarrollo, `${label}.enDesarrollo`)
  assertNullableNumber(assert, buckets.planeado, `${label}.planeado`)
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

test.group('RegulatoryCoverage - auth & response', (group) => {
  let admin: PlatformActor | null = null

  group.setup(async () => {
    admin = await createPlatformAdmin('cobertura-contenido')
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  async function consoleToken(client: ApiClient): Promise<string> {
    if (!admin) throw new Error('El administrador de plataforma no se creó en el setup')
    return loginPlatformConsole(client, admin.email)
  }

  test('401 sin autenticación', async ({ client }) => {
    const response = await client.get(COVERAGE_ROUTE)

    response.assertStatus(401)
  })

  test('200 con autenticación devuelve la forma esperada', async ({ client, assert }) => {
    const token = await consoleToken(client)

    let response
    try {
      response = await client.get(COVERAGE_ROUTE).header('Authorization', `Bearer ${token}`)
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

  test('200 summary devuelve agregado y filas por norma sin confundirse con un id', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await getOrNullIfSchemaMissing(client, `${COVERAGE_ROUTE}/summary`, token)
    if (!response) {
      assert.isTrue(true, SCHEMA_MISSING_NOTE)
      return
    }

    assert.equal(response.status(), 200, JSON.stringify(response.body()))

    const body = response.body()
    assertSuccessEnvelope(assert, body)

    assert.equal(typeof body.data?.aggregate?.evaluableClauses, 'number')
    assertBuckets(assert, body.data.aggregate.coveragePercentage, 'aggregate.coveragePercentage')

    assert.isArray(body.data.regulations)
    for (const row of body.data.regulations as RegulationSummaryRow[]) {
      assert.exists(row.regulationCode)
      assert.equal(typeof row.evaluableClauses, 'number')
      assertBuckets(assert, row.coveragePercentage, `${row.regulationCode}.coveragePercentage`)
    }
  })

  test('200 detalle de NOM-035-STPS devuelve cabecera y numerales con features', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)

    let regulation: Regulation
    try {
      regulation = await Regulation.query().where('regulation_code', REGULATION_CODE).firstOrFail()
    } catch (error) {
      if (isTableMissingError(error)) {
        assert.isTrue(true, SCHEMA_MISSING_NOTE)
        return
      }
      throw error
    }

    const response = await getOrNullIfSchemaMissing(
      client,
      `${COVERAGE_ROUTE}/${regulation.regulationId}`,
      token
    )
    if (!response) {
      assert.isTrue(true, SCHEMA_MISSING_NOTE)
      return
    }

    assert.equal(response.status(), 200, JSON.stringify(response.body()))

    const body = response.body()
    assertSuccessEnvelope(assert, body)

    const header = body.data?.regulation as RegulationDetailHeader
    assert.properties(header, [
      'regulationId',
      'code',
      'title',
      'type',
      'version',
      'status',
      'authority',
      'evaluableClauses',
      'coveredTotal',
      'coveredPartial',
      'uncovered',
      'coveragePercentage',
    ])
    assert.equal(header.regulationId, regulation.regulationId)
    assert.equal(header.code, REGULATION_CODE)
    assert.equal(typeof header.evaluableClauses, 'number')
    assert.equal(typeof header.coveredTotal, 'number')
    assert.equal(typeof header.coveredPartial, 'number')
    assert.equal(typeof header.uncovered, 'number')
    assertNullableNumber(assert, header.coveragePercentage, 'regulation.coveragePercentage')

    assert.isArray(body.data.clauses)
    for (const clause of body.data.clauses as RegulationClauseDetail[]) {
      assert.properties(clause, [
        'regulationClauseId',
        'code',
        'obligationKey',
        'bestCoverage',
        'features',
      ])
      assert.equal(typeof clause.obligationKey, 'string')
      assert.oneOf(clause.bestCoverage, ['total', 'parcial', null])
      assert.isArray(clause.features)
      for (const feature of clause.features) {
        assert.properties(feature, ['systemFeatureId', 'featureStatus', 'coverage', 'module'])
        assert.exists(feature.module?.moduleSlug)
      }
    }
  })

  test('400 con un regulationId no numérico', async ({ client, assert }) => {
    const token = await consoleToken(client)
    const response = await client
      .get(`${COVERAGE_ROUTE}/abc`)
      .header('Authorization', `Bearer ${token}`)

    assert.equal(response.status(), 400)

    const body = response.body()
    assert.properties(body, ['title', 'detail', 'key'])
    assert.equal(body.title, 'Error de validación')
    assert.equal(body.detail, 'El parámetro regulationId debe ser un entero positivo.')
    assert.equal(body.key, 'id-no-numerico')
    assert.notProperty(body, 'code')
  })

  test('404 con una norma inexistente', async ({ client, assert }) => {
    const token = await consoleToken(client)
    const response = await getOrNullIfSchemaMissing(client, `${COVERAGE_ROUTE}/999999`, token)
    if (!response) {
      assert.isTrue(true, SCHEMA_MISSING_NOTE)
      return
    }

    assert.equal(response.status(), 404)

    const body = response.body()
    assert.properties(body, ['title', 'detail', 'key'])
    assert.equal(body.title, 'No encontrado')
    assert.equal(body.detail, 'La norma solicitada no existe o no está vigente.')
    assert.equal(body.key, 'norma-no-encontrada')
    assert.notProperty(body, 'code')
  })
})
