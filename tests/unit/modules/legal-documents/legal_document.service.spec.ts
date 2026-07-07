import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import LegalDocumentError from '#exceptions/legal_document_error'
import LegalDocumentService from '../../../../app/modules/legal-documents/legal_document.service.js'
import type {
  CreatePublishedVersionData,
  LegalDocumentRepository,
} from '../../../../app/modules/legal-documents/legal_document.repository.js'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentContent, LegalDocumentType } from '#models/legal_document'

// ---------------------------------------------------------------------------
// Fake repo en memoria (mismo patrón que tests/unit/modules/nom035-disclosure y
// tests/unit/modules/onboarding: mockear la interfaz del repositorio, sin BD).
// Guarda filas reales para poder verificar, tras publishVersion, cuántas quedan
// is_current=true por tipo — es la forma más directa de probar la regla de
// negocio 3 ("una sola vigente por tipo") sin depender de infraestructura.
// ---------------------------------------------------------------------------

type FakeRow = {
  legalDocumentId: number
  legalDocumentType: LegalDocumentType
  legalDocumentVersion: string
  legalDocumentContent: LegalDocumentContent | null
  legalDocumentIsCurrent: boolean
  legalDocumentStatus: 'draft' | 'published'
  legalDocumentPublishedAt: DateTime | null
  legalDocumentPublishedByUserId: number | null
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    legalDocumentId: 1,
    legalDocumentType: 'terms_conditions',
    legalDocumentVersion: '1.0',
    legalDocumentContent: { es: 'texto es', en: 'text en' },
    legalDocumentIsCurrent: true,
    legalDocumentStatus: 'published',
    legalDocumentPublishedAt: DateTime.fromISO('2026-01-01T00:00:00Z'),
    legalDocumentPublishedByUserId: null,
    ...overrides,
  }
}

function makeInMemoryRepo(seed: FakeRow[] = []) {
  const rows: FakeRow[] = seed.map((r) => ({ ...r }))
  let nextId = rows.length ? Math.max(...rows.map((r) => r.legalDocumentId)) + 1 : 1
  const calls: Array<{ method: string; args: unknown[] }> = []

  const repo: LegalDocumentRepository = {
    async findCurrentByType(type) {
      calls.push({ method: 'findCurrentByType', args: [type] })
      return (rows.find((r) => r.legalDocumentType === type && r.legalDocumentIsCurrent) ??
        null) as unknown as LegalDocument | null
    },
    async findCurrentByTypeForUpdate(type) {
      calls.push({ method: 'findCurrentByTypeForUpdate', args: [type] })
      return (rows.find((r) => r.legalDocumentType === type && r.legalDocumentIsCurrent) ??
        null) as unknown as LegalDocument | null
    },
    async clearCurrentFlag(legalDocumentId) {
      calls.push({ method: 'clearCurrentFlag', args: [legalDocumentId] })
      const row = rows.find((r) => r.legalDocumentId === legalDocumentId)
      if (!row) throw new Error(`fila ${legalDocumentId} no encontrada en el repo falso`)
      row.legalDocumentIsCurrent = false
    },
    async createPublishedVersion(data: CreatePublishedVersionData) {
      calls.push({ method: 'createPublishedVersion', args: [data] })
      const row: FakeRow = {
        legalDocumentId: nextId++,
        legalDocumentType: data.type,
        legalDocumentVersion: data.version,
        legalDocumentContent: data.content,
        legalDocumentIsCurrent: true,
        legalDocumentStatus: 'published',
        legalDocumentPublishedAt: DateTime.now(),
        legalDocumentPublishedByUserId: data.publishedByUserId,
      }
      rows.push(row)
      return row as unknown as LegalDocument
    },
  }

  return { repo, getRows: () => rows, getCalls: () => calls }
}

/** Captura un error lanzado por una función async y lo retorna. */
async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return err
  }
}

// ---------------------------------------------------------------------------
// getCurrent — contenido resuelto por locale (multi-idioma)
// ---------------------------------------------------------------------------
test.group('LegalDocumentService.getCurrent', () => {
  test('devuelve el contenido en el locale solicitado cuando existe traducción', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([makeRow({ legalDocumentType: 'privacy_notice' })])
    const service = new LegalDocumentService(repo)

    const result = await service.getCurrent('privacy_notice', 'en')

    assert.equal(result.content, 'text en')
    assert.equal(result.type, 'privacy_notice')
    assert.equal(result.version, '1.0')
  })

  test('hace fallback a "es" si el locale solicitado no tiene traducción', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ legalDocumentType: 'privacy_notice', legalDocumentContent: { es: 'solo es' } }),
    ])
    const service = new LegalDocumentService(repo)

    const result = await service.getCurrent('privacy_notice', 'fr')

    assert.equal(result.content, 'solo es')
  })

  test('usa "es" quando no se pasa locale explícito', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([makeRow({ legalDocumentType: 'terms_conditions' })])
    const service = new LegalDocumentService(repo)

    const result = await service.getCurrent('terms_conditions')

    assert.equal(result.content, 'texto es')
  })

  test('lanza LegalDocumentError "documento-legal-sin-version-vigente" si el tipo no tiene vigente (caso biometric_consent)', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([]) // biometric_consent nunca sembrado
    const service = new LegalDocumentService(repo)

    const thrown = await catchAsync(() => service.getCurrent('biometric_consent'))

    assert.instanceOf(thrown, LegalDocumentError)
    assert.equal((thrown as LegalDocumentError).key, 'documento-legal-sin-version-vigente')
  })

  test('nunca expone publishedByUserId ni metadatos de auditoría en el DTO', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ legalDocumentType: 'privacy_notice', legalDocumentPublishedByUserId: 42 }),
    ])
    const service = new LegalDocumentService(repo)

    const result = await service.getCurrent('privacy_notice')

    assert.notProperty(result, 'publishedByUserId')
    assert.deepEqual(Object.keys(result).sort(), ['content', 'publishedAt', 'type', 'version'])
  })
})

// ---------------------------------------------------------------------------
// publishVersion — regla de negocio 3: "una sola versión vigente por tipo"
// ---------------------------------------------------------------------------
test.group('LegalDocumentService.publishVersion — regla de negocio 3 (una sola vigente por tipo)', () => {
  test('al publicar la primera versión de un tipo, queda como única vigente', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo([])
    const service = new LegalDocumentService(repo)

    await service.publishVersion({
      type: 'terms_conditions',
      version: '1.0',
      content: { es: 'texto es' },
      publishedByUserId: null,
    })

    const rows = getRows()
    assert.lengthOf(rows, 1)
    assert.isTrue(rows[0].legalDocumentIsCurrent)
    assert.equal(rows[0].legalDocumentStatus, 'published')
  })

  test('al publicar una segunda versión del mismo tipo, apaga la anterior y enciende la nueva', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo([
      makeRow({ legalDocumentId: 1, legalDocumentType: 'terms_conditions', legalDocumentVersion: '1.0' }),
    ])
    const service = new LegalDocumentService(repo)

    await service.publishVersion({
      type: 'terms_conditions',
      version: '2.0',
      content: { es: 'texto v2' },
      publishedByUserId: 7,
    })

    const rows = getRows()
    const currentRows = rows.filter(
      (r) => r.legalDocumentType === 'terms_conditions' && r.legalDocumentIsCurrent
    )

    // Invariante: exactamente una fila vigente para el tipo, nunca cero ni dos.
    assert.lengthOf(currentRows, 1)
    assert.equal(currentRows[0].legalDocumentVersion, '2.0')

    // La anterior se conserva en el histórico (status='published', is_current=false),
    // nunca se borra ni se reescribe su contenido.
    const previous = rows.find((r) => r.legalDocumentVersion === '1.0')
    assert.isDefined(previous)
    assert.isFalse(previous!.legalDocumentIsCurrent)
    assert.equal(previous!.legalDocumentStatus, 'published')
    assert.equal(previous!.legalDocumentContent?.es, 'texto es')
  })

  test('no afecta la vigente de otro tipo de documento', async ({ assert }) => {
    const { repo, getRows } = makeInMemoryRepo([
      makeRow({ legalDocumentId: 1, legalDocumentType: 'terms_conditions', legalDocumentVersion: '1.0' }),
      makeRow({ legalDocumentId: 2, legalDocumentType: 'privacy_notice', legalDocumentVersion: '1.0' }),
    ])
    const service = new LegalDocumentService(repo)

    await service.publishVersion({
      type: 'terms_conditions',
      version: '2.0',
      content: { es: 'texto v2' },
      publishedByUserId: null,
    })

    const rows = getRows()
    const privacyNotice = rows.find((r) => r.legalDocumentType === 'privacy_notice')
    assert.isTrue(privacyNotice!.legalDocumentIsCurrent, 'privacy_notice no debe verse afectado')
    assert.equal(privacyNotice!.legalDocumentVersion, '1.0')
  })

  test('llama clearCurrentFlag antes de createPublishedVersion cuando ya existe una vigente', async ({
    assert,
  }) => {
    const { repo, getCalls } = makeInMemoryRepo([
      makeRow({ legalDocumentId: 1, legalDocumentType: 'terms_conditions', legalDocumentVersion: '1.0' }),
    ])
    const service = new LegalDocumentService(repo)

    await service.publishVersion({
      type: 'terms_conditions',
      version: '2.0',
      content: { es: 'texto v2' },
      publishedByUserId: null,
    })

    const methodOrder = getCalls().map((c) => c.method)
    const clearIndex = methodOrder.indexOf('clearCurrentFlag')
    const createIndex = methodOrder.indexOf('createPublishedVersion')

    assert.isAbove(clearIndex, -1)
    assert.isAbove(createIndex, -1)
    assert.isBelow(clearIndex, createIndex, 'debe apagar la anterior antes de crear la nueva')
  })

  test('no llama clearCurrentFlag si el tipo no tenía ninguna vigente (primera publicación)', async ({
    assert,
  }) => {
    const { repo, getCalls } = makeInMemoryRepo([])
    const service = new LegalDocumentService(repo)

    await service.publishVersion({
      type: 'biometric_consent',
      version: '1.0',
      content: { es: 'primer texto biométrico' },
      publishedByUserId: null,
    })

    assert.isFalse(getCalls().some((c) => c.method === 'clearCurrentFlag'))
  })
})
