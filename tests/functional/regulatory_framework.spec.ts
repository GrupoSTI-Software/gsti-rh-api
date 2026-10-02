import { test } from '@japa/runner'
import type { Group } from '@japa/runner/core'
import type { ApiClient } from '@japa/api-client'
import ApiToken from '#models/api_token'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'

/**
 * USRH1785167064404 — API de consulta del marco regulatorio (solo lectura).
 * Verificación funcional contra BD real ya sembrada (seeders 0028-0031+0033):
 * 8 autoridades (STPS + 7 esqueleto), NOM-035-STPS (47 numerales),
 * NOM-037-STPS (49 numerales).
 *
 * Las cinco lecturas viven bajo `/api/platform` y solo las abre un token de
 * consola de plataforma (`auth` + `platformAdmin`). El 403 del guard y el 404 de
 * las URLs viejas bajo `/api/v1` se prueban en
 * `regulatory_coverage_permission_gate.spec.ts`; aquí se usa un administrador de
 * plataforma con token de consola para probar el contenido.
 */

const TEST_PASSWORD = 'RegulatoryFrameworkPlatform123!'

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
    personFirstname: 'MarcoPlataforma',
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
 * El endpoint de login de plataforma limita las peticiones por IP (10 intentos cada
 * 15 min, en memoria). Para no agotarlo en una corrida con otros specs, el
 * administrador y su token de consola viven a nivel de módulo: se crean una sola vez
 * (lazy, en el primer test que los pide) y se reutilizan en todos los grupos del archivo.
 * El cleanup se hace en el teardown del ÚLTIMO grupo que corre (ver `useConsoleAdmin`).
 */
let sharedAdmin: PlatformActor | null = null
let sharedToken: string | null = null
let registeredGroups = 0
let tornDownGroups = 0

/**
 * Registra el grupo en el conteo del archivo y devuelve la función que entrega el
 * token de consola del administrador compartido. El último grupo en terminar borra
 * el administrador y su persona.
 */
function useConsoleAdmin(group: Group): (client: ApiClient) => Promise<string> {
  registeredGroups += 1

  group.teardown(async () => {
    tornDownGroups += 1
    if (tornDownGroups < registeredGroups) return
    await cleanupActor(sharedAdmin)
    sharedAdmin = null
    sharedToken = null
  })

  return async (client) => {
    sharedAdmin ??= await createPlatformAdmin('marco-contenido')
    sharedToken ??= await loginPlatformConsole(client, sharedAdmin.email)
    return sharedToken
  }
}

test.group('RegulatoryFramework — GET /api/platform/regulatory-authorities', (group) => {
  const consoleToken = useConsoleAdmin(group)

  test('401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/platform/regulatory-authorities')
    response.assertStatus(401)
  })

  test('200: devuelve las autoridades activas ordenadas por shortName ASC (regla 2)', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulatory-authorities')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.type, 'success')
    const rows = body.data as Array<{ slug: string; shortName: string; regulationsCount: number }>
    assert.isArray(rows)
    assert.isAtLeast(rows.length, 8)

    const shortNames = rows.map((r) => r.shortName)
    const sorted = [...shortNames].sort((a, b) => a.localeCompare(b))
    assert.deepEqual(shortNames, sorted, 'debe venir ordenado por shortName ASC')

    const stps = rows.find((r) => r.slug === 'stps')
    assert.exists(stps)
    assert.equal(stps!.regulationsCount, 2)

    const imss = rows.find((r) => r.slug === 'imss')
    assert.exists(imss)
    assert.equal(imss!.regulationsCount, 0)
  })

  test('filtra por has_regulations=true (solo autoridades con normas)', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulatory-authorities')
      .qs({ has_regulations: 'true' })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const rows = response.body().data as Array<{ regulationsCount: number }>
    assert.isAtLeast(rows.length, 1)
    for (const row of rows) assert.isAbove(row.regulationsCount, 0)
  })

  test('422 con has_regulations inválido (REG.VAL.001)', async ({ client, assert }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulatory-authorities')
      .qs({ has_regulations: 'foo' })
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(422)
    assert.equal(response.body().code, 'REG.VAL.001')
    assert.properties(response.body(), ['title', 'detail', 'key', 'code'])
  })
})

test.group('RegulatoryFramework — GET /api/platform/regulatory-authorities/:slug', (group) => {
  const consoleToken = useConsoleAdmin(group)

  test('200: detalle de STPS con sus normas embebidas, textos resueltos', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulatory-authorities/stps')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.slug, 'stps')
    assert.isString(data.description)
    assert.notInclude(data.description, 'regulatory.')
    assert.isArray(data.regulations)
    assert.lengthOf(data.regulations, 2)

    const codes = data.regulations.map((r: { code: string }) => r.code)
    assert.includeMembers(codes, ['NOM-035-STPS', 'NOM-037-STPS'])
  })

  test('404 con autoridad inexistente (REG.NF.001, shape correcto)', async ({ client, assert }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulatory-authorities/no-existe-xyz')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'autoridad-no-encontrada')
    assert.equal(body.code, 'REG.NF.001')
    assert.properties(body, ['title', 'detail', 'key', 'code'])
  })
})

test.group('RegulatoryFramework — GET /api/platform/regulations/:code', (group) => {
  const consoleToken = useConsoleAdmin(group)

  test('200: NOM-035-STPS con árbol completo de 47 numerales bien anidado', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulations/NOM-035-STPS')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.code, 'NOM-035-STPS')
    assert.equal(data.version, '2018')
    assert.notProperty(data, 'regulationInternalNotes')

    function countNodes(nodes: Array<{ children: unknown[] }>): number {
      return nodes.reduce(
        (acc, n) => acc + 1 + countNodes(n.children as Array<{ children: unknown[] }>),
        0
      )
    }
    assert.equal(countNodes(data.clausesTree), 47)

    // 5.1 lleva colgando 5.1.1, 5.1.2, 5.1.3
    const c5 = data.clausesTree.find((n: { code: string }) => n.code === '5')
    assert.exists(c5)
    const c51 = c5.children.find((n: { code: string }) => n.code === '5.1')
    assert.exists(c51)
    assert.deepEqual(
      c51.children.map((n: { code: string }) => n.code),
      ['5.1.1', '5.1.2', '5.1.3']
    )

    // 5.8 lleva colgando 5.8.a, 5.8.b, 5.8.c
    const c58 = c5.children.find((n: { code: string }) => n.code === '5.8')
    assert.exists(c58)
    assert.deepEqual(
      c58.children.map((n: { code: string }) => n.code),
      ['5.8.a', '5.8.b', '5.8.c']
    )

    // 5.7 es hoja
    const c57 = c5.children.find((n: { code: string }) => n.code === '5.7')
    assert.exists(c57)
    assert.deepEqual(c57.children, [])

    // Los textos llegan resueltos, no como claves crudas
    assert.notInclude(c51.title ?? '', 'regulatory.')
    assert.notInclude(c58.obligation ?? '', 'regulatory.')
  })

  test('200: NOM-037-STPS con 49 numerales', async ({ client, assert }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulations/NOM-037-STPS')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(200)
    const data = response.body().data

    function countNodes(nodes: Array<{ children: unknown[] }>): number {
      return nodes.reduce(
        (acc, n) => acc + 1 + countNodes(n.children as Array<{ children: unknown[] }>),
        0
      )
    }
    assert.equal(countNodes(data.clausesTree), 49)
  })

  test('textos del catálogo en español sin claves crudas (NOM-035-STPS y NOM-037-STPS)', async ({
    client,
    assert,
  }) => {
    interface ClauseNode {
      code: string
      title?: string | null
      obligation?: string | null
      explanation?: string | null
      rationale?: string | null
      auditCriteria?: string | null
      children: ClauseNode[]
    }
    const textFields = ['title', 'obligation', 'explanation', 'rationale', 'auditCriteria'] as const

    const rawKeys: string[] = []
    function collectRawKeys(regulationCode: string, nodes: ClauseNode[]): void {
      for (const node of nodes) {
        for (const field of textFields) {
          const value = node[field]
          if (typeof value === 'string' && value.startsWith('regulatory.')) {
            rawKeys.push(`${regulationCode} ${node.code} ${field}: ${value}`)
          }
        }
        collectRawKeys(regulationCode, node.children)
      }
    }

    const token = await consoleToken(client)
    for (const code of ['NOM-035-STPS', 'NOM-037-STPS']) {
      const response = await client
        .get(`/api/platform/regulations/${code}`)
        .header('Authorization', `Bearer ${token}`)
        .header('Accept-Language', 'es')

      response.assertStatus(200)
      const tree = response.body().data.clausesTree as ClauseNode[]
      assert.isAbove(tree.length, 0, `${code} debe traer numerales`)
      collectRawKeys(code, tree)
    }

    assert.deepEqual(rawKeys, [], 'ningún texto debe llegar como clave cruda')
  })

  test('404 con código de norma inexistente — shape exacto (REG.NF.002, regla 6)', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const response = await client
      .get('/api/platform/regulations/NOM-099-XXX')
      .header('Authorization', `Bearer ${token}`)

    response.assertStatus(404)
    assert.deepEqual(response.body(), {
      title: 'Norma no encontrada',
      detail: 'La norma solicitada no existe en el catálogo regulatorio.',
      key: 'norma-no-encontrada',
      code: 'REG.NF.002',
    })
  })

  test('responde en < 200ms con caché caliente (RNF EPIC-08-01, regla 8)', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    // Primer hit: llena el caché.
    await client
      .get('/api/platform/regulations/NOM-035-STPS')
      .header('Authorization', `Bearer ${token}`)

    const start = Date.now()
    const response = await client
      .get('/api/platform/regulations/NOM-035-STPS')
      .header('Authorization', `Bearer ${token}`)
    const elapsedMs = Date.now() - start

    response.assertStatus(200)
    assert.isBelow(elapsedMs, 200)
  })
})

test.group(
  'RegulatoryFramework — GET /api/platform/regulations/:code/clauses/:clauseCode',
  (group) => {
    const consoleToken = useConsoleAdmin(group)

    test('200: numeral 5.8.a con texto, jerarquía y features/evidencia', async ({
      client,
      assert,
    }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/5.8.a')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.code, '5.8.a')
      assert.isString(data.obligation)
      assert.notInclude(data.obligation, 'regulatory.')
      assert.isString(data.explanation)
      assert.isString(data.rationale)
      assert.isString(data.auditCriteria)
      assert.exists(data.parent)
      assert.equal(data.parent.code, '5.8')
      assert.deepEqual(data.children, [])
      assert.isArray(data.features)
      assert.isArray(data.evidenceRequirements)
      assert.isAbove(data.evidenceRequirements.length, 0)
      assert.notInclude(data.evidenceRequirements[0].description, 'regulatory.')
    })

    test('200: numeral padre 5.8 lista sus 3 hijos directos', async ({ client, assert }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/5.8')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const data = response.body().data
      assert.deepEqual(
        data.children.map((c: { code: string }) => c.code),
        ['5.8.a', '5.8.b', '5.8.c']
      )
      assert.exists(data.parent)
      assert.equal(data.parent.code, '5')
    })

    test('404 con norma inexistente (REG.NF.002)', async ({ client, assert }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-099-XXX/clauses/5.1')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(404)
      assert.equal(response.body().code, 'REG.NF.002')
    })

    test('404 con numeral inexistente en norma existente (REG.NF.003)', async ({
      client,
      assert,
    }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/99.99')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(404)
      assert.equal(response.body().code, 'REG.NF.003')
      assert.equal(response.body().key, 'numeral-no-encontrado')
    })

    test('404 (no 500) con numeral de otra norma (pertenencia cruzada)', async ({
      client,
      assert,
    }) => {
      const token = await consoleToken(client)
      // '5.1' existe en NOM-037-STPS con otro id; pedirlo bajo NOM-035-STPS
      // con un código que sólo exista en la otra norma debe dar 404, no 500.
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/5.1.I')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(404)
      assert.equal(response.body().code, 'REG.NF.003')
    })
  }
)

test.group(
  'RegulatoryFramework — GET /api/platform/regulations/:code/clauses/:clauseCode/features',
  (group) => {
    const consoleToken = useConsoleAdmin(group)

    test('200: forma mínima {clause, features}', async ({ client, assert }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/5.8.a/features')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(200)
      const data = response.body().data
      assert.equal(data.clause.code, '5.8.a')
      assert.isArray(data.features)
    })

    test('404 con numeral inexistente (REG.NF.003)', async ({ client, assert }) => {
      const token = await consoleToken(client)
      const response = await client
        .get('/api/platform/regulations/NOM-035-STPS/clauses/99.99/features')
        .header('Authorization', `Bearer ${token}`)

      response.assertStatus(404)
      assert.equal(response.body().code, 'REG.NF.003')
    })
  }
)

test.group('RegulatoryFramework — negativo: sin mutaciones', (group) => {
  const consoleToken = useConsoleAdmin(group)

  test('no existen rutas POST/PUT/DELETE bajo estos paths', async ({ client }) => {
    const token = await consoleToken(client)
    const post = await client
      .post('/api/platform/regulatory-authorities')
      .header('Authorization', `Bearer ${token}`)
      .json({})
    // 404 (ruta inexistente) o 405; nunca 200/201 — cero mutación posible.
    post.assertStatus(404)
  })
})

test.group('RegulatoryFramework — i18n (regla 5)', (group) => {
  const consoleToken = useConsoleAdmin(group)

  test('con Accept-Language: en, los textos llegan en inglés con el mismo shape', async ({
    client,
    assert,
  }) => {
    const token = await consoleToken(client)
    const responseEs = await client
      .get('/api/platform/regulatory-authorities/stps')
      .header('Authorization', `Bearer ${token}`)
    const responseEn = await client
      .get('/api/platform/regulatory-authorities/stps')
      .header('Accept-Language', 'en')
      .header('Authorization', `Bearer ${token}`)

    responseEs.assertStatus(200)
    responseEn.assertStatus(200)

    const dataEs = responseEs.body().data
    const dataEn = responseEn.body().data
    assert.equal(dataEn.slug, dataEs.slug)
    assert.isString(dataEn.description)
    assert.notInclude(dataEn.description, 'regulatory.')
  })
})
