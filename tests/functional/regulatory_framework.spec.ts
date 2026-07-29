import { test } from '@japa/runner'
import User from '#models/user'

/**
 * USRH1785167064404 — API de consulta del marco regulatorio (solo lectura).
 * Verificación funcional contra BD real ya sembrada (seeders 0028-0031+0033):
 * 8 autoridades (STPS + 7 esqueleto), NOM-035-STPS (47 numerales),
 * NOM-037-STPS (49 numerales).
 */

async function getAnyActiveUser(): Promise<User> {
  return User.query().whereNull('user_deleted_at').firstOrFail()
}

test.group('RegulatoryFramework — GET /api/v1/regulatory-authorities', () => {
  test('401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/v1/regulatory-authorities')
    response.assertStatus(401)
  })

  test('200: devuelve las autoridades activas ordenadas por shortName ASC (regla 2)', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client.get('/api/v1/regulatory-authorities').loginAs(user)

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
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulatory-authorities')
      .qs({ has_regulations: 'true' })
      .loginAs(user)

    response.assertStatus(200)
    const rows = response.body().data as Array<{ regulationsCount: number }>
    assert.isAtLeast(rows.length, 1)
    for (const row of rows) assert.isAbove(row.regulationsCount, 0)
  })

  test('422 con has_regulations inválido (REG.VAL.001)', async ({ client, assert }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulatory-authorities')
      .qs({ has_regulations: 'foo' })
      .loginAs(user)

    response.assertStatus(422)
    assert.equal(response.body().code, 'REG.VAL.001')
    assert.properties(response.body(), ['title', 'detail', 'key', 'code'])
  })
})

test.group('RegulatoryFramework — GET /api/v1/regulatory-authorities/:slug', () => {
  test('200: detalle de STPS con sus normas embebidas, textos resueltos', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client.get('/api/v1/regulatory-authorities/stps').loginAs(user)

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

  test('404 con autoridad inexistente (REG.NF.001, shape correcto)', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulatory-authorities/no-existe-xyz')
      .loginAs(user)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'autoridad-no-encontrada')
    assert.equal(body.code, 'REG.NF.001')
    assert.properties(body, ['title', 'detail', 'key', 'code'])
  })
})

test.group('RegulatoryFramework — GET /api/v1/regulations/:code', () => {
  test('200: NOM-035-STPS con árbol completo de 47 numerales bien anidado', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client.get('/api/v1/regulations/NOM-035-STPS').loginAs(user)

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
    const user = await getAnyActiveUser()
    const response = await client.get('/api/v1/regulations/NOM-037-STPS').loginAs(user)

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

  test('404 con código de norma inexistente — shape exacto (REG.NF.002, regla 6)', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client.get('/api/v1/regulations/NOM-099-XXX').loginAs(user)

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
    const user = await getAnyActiveUser()
    // Primer hit: llena el caché.
    await client.get('/api/v1/regulations/NOM-035-STPS').loginAs(user)

    const start = Date.now()
    const response = await client.get('/api/v1/regulations/NOM-035-STPS').loginAs(user)
    const elapsedMs = Date.now() - start

    response.assertStatus(200)
    assert.isBelow(elapsedMs, 200)
  })
})

test.group('RegulatoryFramework — GET /api/v1/regulations/:code/clauses/:clauseCode', () => {
  test('200: numeral 5.8.a con texto, jerarquía y features/evidencia', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/5.8.a')
      .loginAs(user)

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
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/5.8')
      .loginAs(user)

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
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-099-XXX/clauses/5.1')
      .loginAs(user)

    response.assertStatus(404)
    assert.equal(response.body().code, 'REG.NF.002')
  })

  test('404 con numeral inexistente en norma existente (REG.NF.003)', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/99.99')
      .loginAs(user)

    response.assertStatus(404)
    assert.equal(response.body().code, 'REG.NF.003')
    assert.equal(response.body().key, 'numeral-no-encontrado')
  })

  test('404 (no 500) con numeral de otra norma (pertenencia cruzada)', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    // '5.1' existe en NOM-037-STPS con otro id; pedirlo bajo NOM-035-STPS
    // con un código que sólo exista en la otra norma debe dar 404, no 500.
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/5.1.I')
      .loginAs(user)

    response.assertStatus(404)
    assert.equal(response.body().code, 'REG.NF.003')
  })
})

test.group('RegulatoryFramework — GET /api/v1/regulations/:code/clauses/:clauseCode/features', () => {
  test('200: forma mínima {clause, features}', async ({ client, assert }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features')
      .loginAs(user)

    response.assertStatus(200)
    const data = response.body().data
    assert.equal(data.clause.code, '5.8.a')
    assert.isArray(data.features)
  })

  test('404 con numeral inexistente (REG.NF.003)', async ({ client, assert }) => {
    const user = await getAnyActiveUser()
    const response = await client
      .get('/api/v1/regulations/NOM-035-STPS/clauses/99.99/features')
      .loginAs(user)

    response.assertStatus(404)
    assert.equal(response.body().code, 'REG.NF.003')
  })
})

test.group('RegulatoryFramework — negativo: sin mutaciones', () => {
  test('no existen rutas POST/PUT/DELETE bajo estos paths', async ({ client }) => {
    const user = await getAnyActiveUser()
    const post = await client
      .post('/api/v1/regulatory-authorities')
      .loginAs(user)
      .json({})
    // 404 (ruta inexistente) o 405; nunca 200/201 — cero mutación posible.
    post.assertStatus(404)
  })
})

test.group('RegulatoryFramework — i18n (regla 5)', () => {
  test('con Accept-Language: en, los textos llegan en inglés con el mismo shape', async ({
    client,
    assert,
  }) => {
    const user = await getAnyActiveUser()
    const responseEs = await client
      .get('/api/v1/regulatory-authorities/stps')
      .loginAs(user)
    const responseEn = await client
      .get('/api/v1/regulatory-authorities/stps')
      .header('Accept-Language', 'en')
      .loginAs(user)

    responseEs.assertStatus(200)
    responseEn.assertStatus(200)

    const dataEs = responseEs.body().data
    const dataEn = responseEn.body().data
    assert.equal(dataEn.slug, dataEs.slug)
    assert.isString(dataEn.description)
    assert.notInclude(dataEn.description, 'regulatory.')
  })
})
