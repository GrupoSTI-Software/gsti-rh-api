import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import LegalDocument, {
  type LegalDocumentContent,
  type LegalDocumentType,
} from '#models/legal_document'

/**
 * Tests funcionales — `GET /api/public/legal-documents/current` (USRH1790610965572).
 *
 * Lectura pública, SIN sesión, de la versión vigente de `terms_conditions` y
 * `privacy_notice`. Ninguna petición de este archivo usa `loginAs`.
 *
 * Convenciones:
 *  - El ambiente compartido puede tener contenido vigente distinto del seed limpio, así que
 *    cada grupo que necesita un contenido conocido captura el `legalDocumentContent` (y/o el
 *    `is_current`) real de la vigente, lo cambia temporalmente y lo restaura en `teardown`
 *    (mismo patrón de captura/restauración de `legal_document_current.spec.ts`).
 *  - `await limiter.clear()` en `group.each.setup`: el límite de 60/min por IP es compartido
 *    por todos los escenarios y los volvería flaky.
 */

const PUBLIC_TYPES = ['terms_conditions', 'privacy_notice'] as const
const PUBLIC_URL = '/api/public/legal-documents/current'

const ENVELOPE_KEYS = ['type', 'title', 'message', 'data']
const DATA_KEYS = ['type', 'version', 'content', 'publishedAt']

interface ContentSnapshot {
  legalDocumentId: number
  content: LegalDocumentContent | null
}

/** Captura el contenido de la vigente de un tipo para restaurarlo después. */
async function snapshotCurrentContent(type: LegalDocumentType): Promise<ContentSnapshot> {
  const current = await LegalDocument.query()
    .where('legal_document_type', type)
    .where('legal_document_is_current', true)
    .firstOrFail()
  return { legalDocumentId: current.legalDocumentId, content: current.legalDocumentContent }
}

async function writeContent(legalDocumentId: number, content: LegalDocumentContent | null) {
  await LegalDocument.query()
    .where('legal_document_id', legalDocumentId)
    .update({ legal_document_content: content ? JSON.stringify(content) : null })
}

async function restoreContent(snapshot: ContentSnapshot | undefined) {
  if (!snapshot) return
  await writeContent(snapshot.legalDocumentId, snapshot.content)
}

test.group('GET /api/public/legal-documents/current - caminos 200 (CA-1)', (group) => {
  const snapshots = new Map<LegalDocumentType, ContentSnapshot>()

  group.setup(async () => {
    for (const type of PUBLIC_TYPES) {
      const snapshot = await snapshotCurrentContent(type)
      snapshots.set(type, snapshot)
      await writeContent(snapshot.legalDocumentId, {
        es: `<p>Contenido ES ${type}</p>`,
        en: `<p>Content EN ${type}</p>`,
      })
    }
  })

  group.teardown(async () => {
    for (const snapshot of snapshots.values()) {
      await restoreContent(snapshot)
    }
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  for (const type of PUBLIC_TYPES) {
    test(`type=${type}&locale=es responde 200 con la forma exacta y contenido en español`, async ({
      client,
      assert,
    }) => {
      const response = await client.get(PUBLIC_URL).qs({ type, locale: 'es' })

      response.assertStatus(200)
      const body = response.body()
      assert.deepEqual(Object.keys(body), ENVELOPE_KEYS)
      assert.equal(body.type, 'success')
      assert.equal(body.title, 'Documento legal')
      assert.equal(body.message, 'Documento legal vigente obtenido correctamente.')
      assert.deepEqual(Object.keys(body.data), DATA_KEYS)
      assert.equal(body.data.type, type)
      assert.isString(body.data.version)
      assert.isNotEmpty(body.data.version)
      assert.equal(body.data.content, `<p>Contenido ES ${type}</p>`)
      assert.exists(body.data.publishedAt)
    })

    test(`type=${type}&locale=en responde 200 con la forma exacta y contenido en inglés`, async ({
      client,
      assert,
    }) => {
      const response = await client.get(PUBLIC_URL).qs({ type, locale: 'en' })

      response.assertStatus(200)
      const body = response.body()
      assert.deepEqual(Object.keys(body), ENVELOPE_KEYS)
      assert.equal(body.type, 'success')
      assert.equal(body.title, 'Legal document')
      assert.equal(body.message, 'Current legal document retrieved successfully.')
      assert.deepEqual(Object.keys(body.data), DATA_KEYS)
      assert.equal(body.data.type, type)
      assert.equal(body.data.content, `<p>Content EN ${type}</p>`)
    })
  }
})

test.group('GET /api/public/legal-documents/current - locale por defecto (CA-2)', (group) => {
  let snapshot: ContentSnapshot | undefined

  group.setup(async () => {
    snapshot = await snapshotCurrentContent('privacy_notice')
    await writeContent(snapshot.legalDocumentId, {
      es: '<p>Aviso en español</p>',
      en: '<p>Notice in English</p>',
    })
  })

  group.teardown(async () => {
    await restoreContent(snapshot)
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  test('sin locale devuelve el contenido en español', async ({ client, assert }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'privacy_notice' })

    response.assertStatus(200)
    assert.equal(response.body().data.content, '<p>Aviso en español</p>')
  })

  test('con locale vacío devuelve el contenido en español', async ({ client, assert }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'privacy_notice', locale: '' })

    response.assertStatus(200)
    assert.equal(response.body().data.content, '<p>Aviso en español</p>')
  })

  test('versión con content.en vacío pedida con locale=en devuelve el contenido en español', async ({
    client,
    assert,
  }) => {
    await writeContent(snapshot!.legalDocumentId, {
      es: '<p>Aviso en español</p>',
      en: '',
    })

    const response = await client.get(PUBLIC_URL).qs({ type: 'privacy_notice', locale: 'en' })

    response.assertStatus(200)
    assert.equal(response.body().data.content, '<p>Aviso en español</p>')
  })
})

test.group('GET /api/public/legal-documents/current - saneado al servir (CA-3)', (group) => {
  let snapshot: ContentSnapshot | undefined

  group.setup(async () => {
    snapshot = await snapshotCurrentContent('terms_conditions')
    const malicious = [
      '<p>Intro</p>',
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<a href="javascript:alert(1)">x</a>',
      '<a href="//evil.example">y</a>',
      '<p style="position:fixed">z</p>',
      '<a href="https://valanserh.com" target="_blank" rel="opener">ok</a>',
    ].join('')
    await writeContent(snapshot.legalDocumentId, { es: malicious, en: malicious })
  })

  group.teardown(async () => {
    await restoreContent(snapshot)
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  test('el contenido servido no trae cargas activas y todo enlace lleva rel seguro', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions', locale: 'es' })

    response.assertStatus(200)
    const content: string = response.body().data.content

    assert.notInclude(content, '<script')
    assert.notInclude(content, 'alert(')
    assert.notInclude(content, '<img')
    assert.notInclude(content, 'onerror')
    assert.notInclude(content, 'javascript:')
    assert.notInclude(content, '//evil.example')
    assert.notMatch(content, /<p\b[^>]*style=/)

    const anchors = content.match(/<a\b[^>]*>/g) ?? []
    assert.isAtLeast(anchors.length, 1)
    for (const anchor of anchors) {
      assert.include(anchor, 'rel="noopener noreferrer"')
    }
  })
})

test.group('GET /api/public/legal-documents/current - errores de tipo e idioma (422)', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
  })

  const INVALID_TYPE_BODY = {
    type: 'error',
    title: 'Tipo de documento inválido',
    detail: 'El tipo de documento solicitado no está disponible para consulta pública.',
    key: 'tipo-de-documento-invalido',
    code: 'LGDOC.VAL.001',
  }

  test('CA-4: biometric_consent e inexistente responden el mismo 422, sin contenido', async ({
    client,
    assert,
  }) => {
    const biometric = await client.get(PUBLIC_URL).qs({ type: 'biometric_consent' })
    const unknown = await client.get(PUBLIC_URL).qs({ type: 'inexistente' })

    biometric.assertStatus(422)
    unknown.assertStatus(422)
    assert.deepEqual(biometric.body(), INVALID_TYPE_BODY)
    assert.deepEqual(unknown.body(), biometric.body())
    // CA-10: los errores no se cachean.
    assert.equal(biometric.header('cache-control'), 'no-store')
    assert.equal(unknown.header('cache-control'), 'no-store')
  })

  test('CA-5: sin type responde 422 con el detalle de parámetro faltante', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL)

    response.assertStatus(422)
    assert.deepEqual(response.body(), {
      ...INVALID_TYPE_BODY,
      detail: 'Indica el tipo de documento: terms_conditions o privacy_notice.',
    })
    assert.equal(response.header('cache-control'), 'no-store')
  })

  test('CA-6: locale=fr responde 422 LGDOC.PUBLIC.001', async ({ client, assert }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions', locale: 'fr' })

    response.assertStatus(422)
    assert.deepEqual(response.body(), {
      type: 'error',
      title: 'Idioma de documento inválido',
      detail: 'El idioma solicitado no está disponible. Usa es o en.',
      key: 'idioma-de-documento-invalido',
      code: 'LGDOC.PUBLIC.001',
    })
    assert.equal(response.header('cache-control'), 'no-store')
  })

  test('CA-6: con type y locale inválidos a la vez gana el error de tipo', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'inexistente', locale: 'fr' })

    response.assertStatus(422)
    assert.deepEqual(response.body(), INVALID_TYPE_BODY)
    assert.equal(response.header('cache-control'), 'no-store')
  })

  test('sin type y con locale inválido también gana el error de tipo (detalle de faltante)', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL).qs({ locale: 'fr' })

    response.assertStatus(422)
    assert.equal(response.body().code, 'LGDOC.VAL.001')
    assert.equal(
      response.body().detail,
      'Indica el tipo de documento: terms_conditions o privacy_notice.'
    )
  })
})

test.group('GET /api/public/legal-documents/current - sin versión vigente (CA-7)', (group) => {
  let previousCurrentId: number | null = null

  group.setup(async () => {
    const previous = await LegalDocument.query()
      .where('legal_document_type', 'privacy_notice')
      .where('legal_document_is_current', true)
      .first()
    previousCurrentId = previous?.legalDocumentId ?? null

    if (previousCurrentId !== null) {
      await LegalDocument.query()
        .where('legal_document_id', previousCurrentId)
        .update({ legal_document_is_current: false })
    }
  })

  group.teardown(async () => {
    if (previousCurrentId !== null) {
      await LegalDocument.query()
        .where('legal_document_id', previousCurrentId)
        .update({ legal_document_is_current: true })
    }
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  test('un tipo público sin vigente responde 404 LGDOC.NF.001 con no-store', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'privacy_notice' })

    response.assertStatus(404)
    assert.deepEqual(response.body(), {
      type: 'error',
      title: 'Documento legal sin versión vigente',
      detail: 'Este documento todavía no tiene una versión publicada.',
      key: 'documento-legal-sin-version-vigente',
      code: 'LGDOC.NF.001',
    })
    assert.equal(response.header('cache-control'), 'no-store')
  })

  test('el 404 con locale=en usa el idioma pedido', async ({ client, assert }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'privacy_notice', locale: 'en' })

    response.assertStatus(404)
    assert.equal(response.body().title, 'Legal document without a current version')
    assert.equal(response.body().code, 'LGDOC.NF.001')
    assert.equal(response.header('cache-control'), 'no-store')
  })
})

test.group('GET /api/public/legal-documents/current - cabeceras y Accept-Language', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
  })

  test('CA-9: el 200 trae Cache-Control privado, Vary con Origin y nunca public con Set-Cookie', async ({
    client,
    assert,
  }) => {
    const response = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions' })

    response.assertStatus(200)
    assert.equal(response.header('cache-control'), 'private, max-age=300')
    assert.include(String(response.header('vary')).toLowerCase(), 'origin')

    const setCookie = response.headers()['set-cookie']
    if (setCookie) {
      assert.notInclude(String(response.header('cache-control')), 'public')
    }
  })

  test('CA-12: Accept-Language no cambia el cuerpo cuando locale viene en la query', async ({
    client,
    assert,
  }) => {
    const withEn = await client
      .get(PUBLIC_URL)
      .qs({ type: 'privacy_notice', locale: 'es' })
      .header('Accept-Language', 'en')
    const withEs = await client
      .get(PUBLIC_URL)
      .qs({ type: 'privacy_notice', locale: 'es' })
      .header('Accept-Language', 'es')

    withEn.assertStatus(200)
    withEs.assertStatus(200)
    assert.equal(withEn.body().title, 'Documento legal')
    assert.deepEqual(withEn.body(), withEs.body())
  })
})

test.group(
  'GET /api/public/legal-documents/current - frescura sin caché de servidor (CA-11)',
  (group) => {
    let originalCurrentId: number | null = null
    let createdId: number | null = null

    group.setup(async () => {
      const current = await LegalDocument.query()
        .where('legal_document_type', 'terms_conditions')
        .where('legal_document_is_current', true)
        .first()
      originalCurrentId = current?.legalDocumentId ?? null
    })

    group.teardown(async () => {
      // Restaura la vigente original y borra la fila creada por el escenario.
      if (createdId !== null) {
        await LegalDocument.query().where('legal_document_id', createdId).delete()
      }
      if (originalCurrentId !== null) {
        await LegalDocument.query()
          .where('legal_document_id', originalCurrentId)
          .update({ legal_document_is_current: true })
      }
    })

    group.each.setup(async () => {
      await limiter.clear()
    })

    test('tras cambiar la vigente en la base, la siguiente consulta trae la versión nueva', async ({
      client,
      assert,
    }) => {
      assert.isNotNull(originalCurrentId, 'terms_conditions debe tener una vigente sembrada')

      const before = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions', locale: 'es' })
      before.assertStatus(200)
      const versionBefore: string = before.body().data.version

      const newVersion = `QA-${Date.now()}`
      await LegalDocument.query()
        .where('legal_document_type', 'terms_conditions')
        .where('legal_document_is_current', true)
        .update({ legal_document_is_current: false })
      const created = await LegalDocument.create({
        legalDocumentType: 'terms_conditions',
        legalDocumentVersion: newVersion,
        legalDocumentContent: { es: '<p>Contenido QA frescura</p>', en: '<p>QA freshness</p>' },
        legalDocumentIsCurrent: true,
        legalDocumentStatus: 'published',
      })
      createdId = created.legalDocumentId

      const after = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions', locale: 'es' })
      after.assertStatus(200)
      assert.equal(after.body().data.version, newVersion)
      assert.notEqual(after.body().data.version, versionBefore)
      assert.equal(after.body().data.content, '<p>Contenido QA frescura</p>')
    })
  }
)

test.group('GET /api/public/legal-documents/current - CORS (CA-13)', (group) => {
  group.each.setup(async () => {
    await limiter.clear()
  })

  test('un origen fuera de la lista blanca no recibe Access-Control-Allow-Origin', async ({
    client,
    assert,
  }) => {
    const origin = 'https://origin-no-permitido.example'
    const response = await client
      .get(PUBLIC_URL)
      .qs({ type: 'terms_conditions' })
      .header('Origin', origin)

    response.assertStatus(200)
    assert.notProperty(response.headers(), 'access-control-allow-origin')
    assert.notEqual(response.header('access-control-allow-origin'), origin)
  })
})

/**
 * IMPORTANTE: este grupo va SIEMPRE al final del archivo. Agota el límite de la IP de pruebas y
 * `limiter.clear()` en `each.setup`/`teardown` es lo que evita contaminar a cualquier grupo
 * que se agregue después.
 */
test.group('GET /api/public/legal-documents/current - límite por IP (CA-8, CA-10)', (group) => {
  let previousCurrentId: number | null = null

  group.setup(async () => {
    const previous = await LegalDocument.query()
      .where('legal_document_type', 'terms_conditions')
      .where('legal_document_is_current', true)
      .first()
    previousCurrentId = previous?.legalDocumentId ?? null
  })

  group.teardown(async () => {
    if (previousCurrentId !== null) {
      await LegalDocument.query()
        .where('legal_document_id', previousCurrentId)
        .update({ legal_document_is_current: true })
    }
    await limiter.clear()
  })

  group.each.setup(async () => {
    await limiter.clear()
  })

  test('la petición 61 responde 429 con el contrato exacto, cabeceras y sin llegar a la base', async ({
    client,
    assert,
  }) => {
    assert.isNotNull(previousCurrentId, 'terms_conditions debe tener una vigente sembrada')

    for (let attempt = 1; attempt <= 60; attempt++) {
      const ok = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions' })
      assert.equal(ok.status(), 200, `la petición ${attempt} debe responder 200`)
    }

    // Prueba de que la 61 no toca la base: sin vigente el controller respondería 404.
    await LegalDocument.query()
      .where('legal_document_id', previousCurrentId!)
      .update({ legal_document_is_current: false })

    const blocked = await client.get(PUBLIC_URL).qs({ type: 'terms_conditions' })

    blocked.assertStatus(429)
    const { retryAfterSeconds, ...body } = blocked.body()
    assert.deepEqual(body, {
      type: 'error',
      title: 'Demasiadas consultas de documentos legales',
      detail:
        'Se alcanzó el límite de consultas. Espera unos segundos antes de volver a intentarlo.',
      key: 'demasiadas-consultas-de-documentos-legales',
      code: 'LGDOC.PUBLIC.002',
    })
    assert.isNumber(retryAfterSeconds)
    assert.isAbove(retryAfterSeconds, 0)

    assert.exists(blocked.header('retry-after'))
    assert.equal(blocked.header('x-ratelimit-limit'), '60')
    assert.equal(blocked.header('x-ratelimit-remaining'), '0')
    assert.exists(blocked.header('x-ratelimit-reset'))

    // CA-10: el 429 tampoco se cachea.
    assert.equal(blocked.header('cache-control'), 'no-store')
  })
})
