import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import TeleworkPhotoNoticeError from '#modules/telework-photo-notice/telework_photo_notice.error'
import TeleworkPhotoNoticeService from '#modules/telework-photo-notice/telework_photo_notice.service'
import type {
  CreateDraftData,
  MarkAsPublishedData,
  TeleworkPhotoNoticeRepository,
  UpdateDraftData,
} from '#modules/telework-photo-notice/telework_photo_notice.repository'
import type TeleworkPhotoNotice from '#models/telework_photo_notice'
import type TeleworkPhotoNoticeTemplate from '#models/telework_photo_notice_template'
import { TELEWORK_PHOTO_NOTICE_PLACEHOLDERS } from '#constants/telework_photo_notice'

/**
 * Unit — `TeleworkPhotoNoticeService` (VLRH-H1791306079310).
 *
 * Parte 1: plantilla vigente, estado, ciclo del borrador, historial de
 * versiones y `hasAcknowledgedCurrent`. Parte 2: `publish` (marcadores,
 * saneado, huella y transacción). Mismo patrón que
 * `tests/unit/modules/telework-policy/telework_policy.service.spec.ts`:
 * repositorio falso en memoria con bitácora de llamadas y `db.transaction`
 * real (sin mockear), sin BD real para las entidades de negocio. Los métodos
 * falsos del camino de publicación ignoran el `trx` que reciben.
 */

type FakePublisher = {
  userId: number
  userEmail: string
  person: { personFirstname: string; personLastname: string; personSecondLastname: string } | null
}

type FakeRow = {
  teleworkPhotoNoticeId: number
  businessUnitId: number
  teleworkPhotoNoticeTemplateId: number | null
  teleworkPhotoNoticeVersion: number
  teleworkPhotoNoticeTitle: string
  teleworkPhotoNoticeContent: string
  teleworkPhotoNoticeRenderedContent: string | null
  teleworkPhotoNoticeStatus: 'draft' | 'published'
  teleworkPhotoNoticeIsCurrent: boolean
  teleworkPhotoNoticeContentHash: string | null
  createdByUserId: number
  updatedByUserId: number
  publishedByUserId: number | null
  publishedAt: DateTime | null
  teleworkPhotoNoticeCreatedAt: DateTime
  teleworkPhotoNoticeUpdatedAt: DateTime
  deletedAt: DateTime | null
  publisher?: FakePublisher | null
}

type FakeTemplateRow = {
  teleworkPhotoNoticeTemplateId: number
  teleworkPhotoNoticeTemplateVersion: string
  teleworkPhotoNoticeTemplateTitle: string
  teleworkPhotoNoticeTemplateContent: string
  teleworkPhotoNoticeTemplateIsCurrent: boolean
}

type FakeAcknowledgement = {
  teleworkPhotoNoticeId: number
  employeeId: number
  businessUnitId: number
}

const FAKE_USERS: Record<number, FakePublisher> = {
  9: {
    userId: 9,
    userEmail: 'root9@gsti-tests.local',
    person: { personFirstname: 'Root', personLastname: 'Nueve', personSecondLastname: '' },
  },
}

/** Texto de la plantilla: conserva el marcador y trae marcado que el saneado debe tirar. */
const TEMPLATE_CONTENT =
  '<p>La razón social {{razon_social}} es responsable del tratamiento.</p><script>alert(1)</script>'

function makeTemplate(overrides: Partial<FakeTemplateRow> = {}): FakeTemplateRow {
  return {
    teleworkPhotoNoticeTemplateId: 7,
    teleworkPhotoNoticeTemplateVersion: 'v1',
    teleworkPhotoNoticeTemplateTitle: 'Aviso de privacidad de la evidencia fotográfica',
    teleworkPhotoNoticeTemplateContent: TEMPLATE_CONTENT,
    teleworkPhotoNoticeTemplateIsCurrent: true,
    ...overrides,
  }
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    teleworkPhotoNoticeId: 1,
    businessUnitId: 5,
    teleworkPhotoNoticeTemplateId: null,
    teleworkPhotoNoticeVersion: 1,
    teleworkPhotoNoticeTitle: 'Aviso de privacidad de la evidencia fotográfica',
    teleworkPhotoNoticeContent: '<p>Aviso con {{razon_social}}</p>',
    teleworkPhotoNoticeRenderedContent: null,
    teleworkPhotoNoticeStatus: 'draft',
    teleworkPhotoNoticeIsCurrent: false,
    teleworkPhotoNoticeContentHash: null,
    createdByUserId: 9,
    updatedByUserId: 9,
    publishedByUserId: null,
    publishedAt: null,
    teleworkPhotoNoticeCreatedAt: DateTime.fromISO('2026-01-01T00:00:00'),
    teleworkPhotoNoticeUpdatedAt: DateTime.fromISO('2026-01-01T00:00:00'),
    deletedAt: null,
    ...overrides,
  }
}

function makeInMemoryRepo(
  seed: FakeRow[] = [],
  options: {
    template?: FakeTemplateRow | null
    acknowledgements?: FakeAcknowledgement[]
    createDraftErrorCode?: string
    /** Razón social por empresa; ausente ⇒ el repositorio responde `null` (empresa inexistente). */
    businessUnitLegalNames?: Record<number, string>
  } = {}
) {
  const rows: FakeRow[] = seed.map((row) => ({ ...row }))
  const acknowledgements: FakeAcknowledgement[] = (options.acknowledgements ?? []).map((ack) => ({
    ...ack,
  }))
  const template = options.template ?? null
  const legalNames: Record<number, string> = options.businessUnitLegalNames ?? {
    5: 'Empresa Cinco SA de CV',
  }
  let nextId = rows.length ? Math.max(...rows.map((row) => row.teleworkPhotoNoticeId)) + 1 : 1
  const calls: Array<{ method: string; args: unknown[] }> = []

  function record(method: string, args: unknown[]) {
    calls.push({ method, args })
  }

  function attachPublisher(row: FakeRow) {
    row.publisher =
      row.publishedByUserId !== null ? (FAKE_USERS[row.publishedByUserId] ?? null) : null
  }

  function findRow(teleworkPhotoNoticeId: number, businessUnitId: number): FakeRow {
    const row = rows.find(
      (candidate) =>
        candidate.teleworkPhotoNoticeId === teleworkPhotoNoticeId &&
        candidate.businessUnitId === businessUnitId
    )
    if (!row) {
      throw new Error(
        `fila ${teleworkPhotoNoticeId} de la empresa ${businessUnitId} no encontrada en el repo falso`
      )
    }
    return row
  }

  const repo: TeleworkPhotoNoticeRepository = {
    async findTemplateCurrent() {
      record('findTemplateCurrent', [])
      return template as unknown as TeleworkPhotoNoticeTemplate | null
    },
    async findDraftByBusinessUnit(businessUnitId: number) {
      record('findDraftByBusinessUnit', [businessUnitId])
      const found = rows
        .filter(
          (row) =>
            row.businessUnitId === businessUnitId &&
            row.teleworkPhotoNoticeStatus === 'draft' &&
            !row.deletedAt
        )
        .sort((a, b) => b.teleworkPhotoNoticeVersion - a.teleworkPhotoNoticeVersion)[0]
      return (found ?? null) as unknown as TeleworkPhotoNotice | null
    },
    async findDraftByBusinessUnitForUpdate(businessUnitId: number) {
      record('findDraftByBusinessUnitForUpdate', [businessUnitId])
      const found = rows
        .filter(
          (row) =>
            row.businessUnitId === businessUnitId &&
            row.teleworkPhotoNoticeStatus === 'draft' &&
            !row.deletedAt
        )
        .sort((a, b) => b.teleworkPhotoNoticeVersion - a.teleworkPhotoNoticeVersion)[0]
      return (found ?? null) as unknown as TeleworkPhotoNotice | null
    },
    async findCurrentByBusinessUnit(businessUnitId: number) {
      record('findCurrentByBusinessUnit', [businessUnitId])
      const found = rows.find(
        (row) =>
          row.businessUnitId === businessUnitId &&
          row.teleworkPhotoNoticeIsCurrent &&
          row.teleworkPhotoNoticeStatus === 'published'
      )
      if (found) attachPublisher(found)
      return (found ?? null) as unknown as TeleworkPhotoNotice | null
    },
    async findCurrentByBusinessUnitForUpdate(businessUnitId: number) {
      record('findCurrentByBusinessUnitForUpdate', [businessUnitId])
      const found = rows.find(
        (row) => row.businessUnitId === businessUnitId && row.teleworkPhotoNoticeIsCurrent
      )
      return (found ?? null) as unknown as TeleworkPhotoNotice | null
    },
    async clearCurrentFlag(teleworkPhotoNoticeId: number, businessUnitId: number) {
      record('clearCurrentFlag', [teleworkPhotoNoticeId, businessUnitId])
      findRow(teleworkPhotoNoticeId, businessUnitId).teleworkPhotoNoticeIsCurrent = false
    },
    async findMaxVersion(businessUnitId: number) {
      record('findMaxVersion', [businessUnitId])
      // Sin filtrar por `deletedAt`: la versión nunca se reutiliza (CA-10).
      const versions = rows
        .filter((row) => row.businessUnitId === businessUnitId)
        .map((row) => row.teleworkPhotoNoticeVersion)
      return versions.length ? Math.max(...versions) : 0
    },
    async findBusinessUnitLegalName(businessUnitId: number) {
      record('findBusinessUnitLegalName', [businessUnitId])
      return legalNames[businessUnitId] ?? null
    },
    async createDraft(data: CreateDraftData) {
      record('createDraft', [data])
      if (options.createDraftErrorCode) {
        const error: Error & { code?: string } = new Error('ER_DUP_ENTRY simulado')
        error.code = options.createDraftErrorCode
        throw error
      }
      const row: FakeRow = {
        teleworkPhotoNoticeId: nextId++,
        businessUnitId: data.businessUnitId,
        teleworkPhotoNoticeTemplateId: data.templateId,
        teleworkPhotoNoticeVersion: data.version,
        teleworkPhotoNoticeTitle: data.title,
        teleworkPhotoNoticeContent: data.content,
        teleworkPhotoNoticeRenderedContent: null,
        teleworkPhotoNoticeStatus: 'draft',
        teleworkPhotoNoticeIsCurrent: false,
        teleworkPhotoNoticeContentHash: null,
        createdByUserId: data.createdByUserId,
        updatedByUserId: data.createdByUserId,
        publishedByUserId: null,
        publishedAt: null,
        teleworkPhotoNoticeCreatedAt: DateTime.now(),
        teleworkPhotoNoticeUpdatedAt: DateTime.now(),
        deletedAt: null,
      }
      rows.push(row)
      return row as unknown as TeleworkPhotoNotice
    },
    async updateDraft(
      teleworkPhotoNoticeId: number,
      businessUnitId: number,
      data: UpdateDraftData
    ) {
      record('updateDraft', [teleworkPhotoNoticeId, businessUnitId, data])
      const row = findRow(teleworkPhotoNoticeId, businessUnitId)
      row.teleworkPhotoNoticeTitle = data.title
      row.teleworkPhotoNoticeContent = data.content
      row.updatedByUserId = data.updatedByUserId
      return row as unknown as TeleworkPhotoNotice
    },
    async softDeleteDraft(teleworkPhotoNoticeId: number, businessUnitId: number) {
      record('softDeleteDraft', [teleworkPhotoNoticeId, businessUnitId])
      findRow(teleworkPhotoNoticeId, businessUnitId).deletedAt = DateTime.now()
    },
    async markAsPublished(
      teleworkPhotoNoticeId: number,
      businessUnitId: number,
      data: MarkAsPublishedData
    ) {
      record('markAsPublished', [teleworkPhotoNoticeId, businessUnitId, data])
      const row = findRow(teleworkPhotoNoticeId, businessUnitId)
      row.teleworkPhotoNoticeStatus = 'published'
      row.teleworkPhotoNoticeIsCurrent = true
      row.teleworkPhotoNoticeRenderedContent = data.renderedContent
      row.teleworkPhotoNoticeContentHash = data.contentHash
      row.publishedByUserId = data.publishedByUserId
      row.publishedAt = DateTime.now()
      attachPublisher(row)
      return row as unknown as TeleworkPhotoNotice
    },
    async listPublishedVersions(businessUnitId: number) {
      record('listPublishedVersions', [businessUnitId])
      const found = rows
        .filter(
          (row) =>
            row.businessUnitId === businessUnitId &&
            row.teleworkPhotoNoticeStatus === 'published' &&
            !row.deletedAt
        )
        .sort((a, b) => b.teleworkPhotoNoticeVersion - a.teleworkPhotoNoticeVersion)
      found.forEach(attachPublisher)
      return found as unknown as TeleworkPhotoNotice[]
    },
    async countAcknowledgementsByNotice(businessUnitId: number) {
      record('countAcknowledgementsByNotice', [businessUnitId])
      const counts = new Map<number, number>()
      for (const ack of acknowledgements) {
        if (ack.businessUnitId !== businessUnitId) continue
        counts.set(ack.teleworkPhotoNoticeId, (counts.get(ack.teleworkPhotoNoticeId) ?? 0) + 1)
      }
      return counts
    },
    async hasAcknowledgement(
      businessUnitId: number,
      teleworkPhotoNoticeId: number,
      employeeId: number
    ) {
      record('hasAcknowledgement', [businessUnitId, teleworkPhotoNoticeId, employeeId])
      return acknowledgements.some(
        (ack) =>
          ack.businessUnitId === businessUnitId &&
          ack.teleworkPhotoNoticeId === teleworkPhotoNoticeId &&
          ack.employeeId === employeeId
      )
    },
  }

  return {
    repo,
    getRows: () => rows,
    getAcknowledgements: () => acknowledgements,
    getCalls: () => calls,
    callsOf: (method: string) => calls.filter((call) => call.method === method),
  }
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error
  }
}

const NOTICE_LIMIT_METHODS = [
  'findTemplateCurrent',
  'findDraftByBusinessUnit',
  'findCurrentByBusinessUnit',
  'findMaxVersion',
  'createDraft',
  'updateDraft',
  'softDeleteDraft',
  'listPublishedVersions',
  'countAcknowledgementsByNotice',
  'hasAcknowledgement',
] as const

// ---------------------------------------------------------------------------
// Alcance no resuelto — Review Focus 3
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService — alcance no resuelto', () => {
  test('Objetivo: Review Focus 3 — todo método público falla cerrado sin tocar el repositorio (businessUnitId <= 0)', async ({
    assert,
  }) => {
    for (const businessUnitId of [0, -1]) {
      const { repo, getCalls } = makeInMemoryRepo([makeRow()], { template: makeTemplate() })
      const service = new TeleworkPhotoNoticeService(repo)

      // `getTemplate` no recibe empresa: no entra en esta lista.
      const invocations: Array<{ method: string; invoke: () => Promise<unknown> }> = [
        { method: 'getState', invoke: () => service.getState(businessUnitId) },
        { method: 'createDraft', invoke: () => service.createDraft(businessUnitId, 9) },
        {
          method: 'updateDraft',
          invoke: () =>
            service.updateDraft(businessUnitId, { title: 'Título', content: '<p>c</p>' }, 9),
        },
        { method: 'discardDraft', invoke: () => service.discardDraft(businessUnitId) },
        { method: 'listVersions', invoke: () => service.listVersions(businessUnitId) },
        {
          method: 'hasAcknowledgedCurrent',
          invoke: () => service.hasAcknowledgedCurrent(businessUnitId, 10),
        },
      ]

      for (const { method, invoke } of invocations) {
        const thrown = await captureRejection(invoke())

        assert.instanceOf(thrown, TeleworkPhotoNoticeError, `${method} debe fallar cerrado`)
        assert.equal((thrown as TeleworkPhotoNoticeError).key, 'aviso-no-publicado')
        assert.lengthOf(getCalls(), 0, `${method} no debe tocar el repositorio`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// getTemplate — CA-01, CA-11
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.getTemplate', () => {
  test('Objetivo: CA-11 — sin plantilla vigente, getTemplate rechaza con plantilla-no-encontrada', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([], { template: null })
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.getTemplate())

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'plantilla-no-encontrada')
  })

  test('Objetivo: CA-01 — la plantilla base se sirve con marcadores sin resolver y la lista cerrada', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([], { template: makeTemplate() })
    const service = new TeleworkPhotoNoticeService(repo)

    const dto = await service.getTemplate()

    assert.equal(dto.templateId, 7)
    assert.equal(dto.version, 'v1')
    assert.equal(dto.title, 'Aviso de privacidad de la evidencia fotográfica')
    assert.include(dto.content, '{{razon_social}}', 'el marcador viaja sin resolver')
    assert.notInclude(dto.content, '<script', 'el texto se sanea al servir')
    assert.deepEqual(dto.placeholders, ['razon_social'])
    assert.deepEqual(dto.placeholders, [...TELEWORK_PHOTO_NOTICE_PLACEHOLDERS])
  })
})

// ---------------------------------------------------------------------------
// getState — Review Focus 4
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.getState', () => {
  test('Objetivo: Review Focus 4 — el estado de una empresa sin aviso no consulta la plantilla', async ({
    assert,
  }) => {
    const { repo, getCalls, callsOf } = makeInMemoryRepo([], { template: makeTemplate() })
    const service = new TeleworkPhotoNoticeService(repo)

    const state = await service.getState(5)

    assert.isNull(state.current)
    assert.isNull(state.draft)
    assert.lengthOf(
      callsOf('findDraftByBusinessUnit'),
      1,
      'el estado sí consulta el borrador vivo de la empresa'
    )
    assert.lengthOf(
      callsOf('findCurrentByBusinessUnit'),
      1,
      'el estado sí consulta la versión vigente de la empresa'
    )
    assert.notInclude(
      getCalls().map((call) => call.method),
      'findTemplateCurrent',
      'una empresa sin aviso no debe depender de la plantilla'
    )
    assert.notInclude(
      getCalls().map((call) => call.method),
      'createDraft',
      'el estado nunca crea nada'
    )
  })
})

// ---------------------------------------------------------------------------
// createDraft — CA-02, CA-09, CA-10
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.createDraft', () => {
  test('Objetivo: CA-02 — el primer borrador nace de la plantilla vigente con version 1', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo([], { template: makeTemplate() })
    const service = new TeleworkPhotoNoticeService(repo)

    const draft = await service.createDraft(5, 9)

    assert.equal(draft.status, 'draft')
    assert.equal(draft.version, 1)
    assert.equal(draft.title, 'Aviso de privacidad de la evidencia fotográfica')
    assert.include(draft.content, '{{razon_social}}')
    assert.equal(draft.templateId, 7)

    const row = getRows()[0]
    assert.equal(row.createdByUserId, 9)
    assert.isFalse(row.teleworkPhotoNoticeIsCurrent)
    assert.equal(row.teleworkPhotoNoticeStatus, 'draft')
    assert.isNull(row.teleworkPhotoNoticeContentHash)
    assert.isNull(row.publishedByUserId)
    assert.isNull(row.publishedAt)
  })

  test('Objetivo: CA-02 — el segundo borrador nace de la última versión publicada y con la versión siguiente', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 30,
          teleworkPhotoNoticeVersion: 1,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeIsCurrent: true,
          teleworkPhotoNoticeTitle: 'Aviso publicado v1',
          teleworkPhotoNoticeContent: '<p>Aviso vigente con {{razon_social}}</p>',
          teleworkPhotoNoticeRenderedContent: '<p>Aviso vigente con Empresa Cinco SA de CV</p>',
          teleworkPhotoNoticeTemplateId: 7,
          teleworkPhotoNoticeContentHash: 'hash-v1',
          publishedByUserId: 9,
          publishedAt: DateTime.fromISO('2026-05-01T10:00:00'),
        }),
      ],
      { template: makeTemplate() }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const draft = await service.createDraft(5, 9)

    assert.equal(draft.version, 2)
    assert.equal(draft.status, 'draft')
    assert.equal(draft.title, 'Aviso publicado v1')
    assert.include(draft.content, '{{razon_social}}', 'copia el texto CON marcadores de la vigente')
    assert.equal(draft.templateId, 7, 'hereda la plantilla de la versión de la que parte')

    const created = getRows().find((row) => row.teleworkPhotoNoticeVersion === 2)
    assert.isDefined(created)
    assert.equal(created!.teleworkPhotoNoticeTemplateId, 7)
    assert.equal(created!.createdByUserId, 9)
  })

  test('Objetivo: CA-10 — un borrador vivo rechaza otro borrador (409 borrador-ya-existe)', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([makeRow({ teleworkPhotoNoticeId: 40 })], {
      template: makeTemplate(),
    })
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.createDraft(5, 9))

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'borrador-ya-existe')
  })

  test('Objetivo: CA-09 — el UNIQUE atrapado se traduce a 409 y nunca a 500', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([], {
      template: makeTemplate(),
      createDraftErrorCode: 'ER_DUP_ENTRY',
    })
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.createDraft(5, 9))

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'borrador-ya-existe')
  })
})

// ---------------------------------------------------------------------------
// updateDraft / discardDraft — CA-10, CA-17
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.updateDraft y discardDraft', () => {
  test('Objetivo: CA-10 — editar/descartar sin borrador es borrador-no-encontrado', async ({
    assert,
  }) => {
    const { repo, getCalls } = makeInMemoryRepo([], { template: makeTemplate() })
    const service = new TeleworkPhotoNoticeService(repo)

    const updateThrown = await captureRejection(
      service.updateDraft(5, { title: 'Título nuevo', content: '<p>c</p>' }, 9)
    )
    assert.instanceOf(updateThrown, TeleworkPhotoNoticeError)
    assert.equal((updateThrown as TeleworkPhotoNoticeError).key, 'borrador-no-encontrado')

    const discardThrown = await captureRejection(service.discardDraft(5))
    assert.instanceOf(discardThrown, TeleworkPhotoNoticeError)
    assert.equal((discardThrown as TeleworkPhotoNoticeError).key, 'borrador-no-encontrado')

    assert.lengthOf(getCalls().filter((call) => call.method === 'updateDraft'), 0)
    assert.lengthOf(getCalls().filter((call) => call.method === 'softDeleteDraft'), 0)
  })

  test('Objetivo: CA-10 — discardDraft con borrador solo lo soft-deletea', async ({ assert }) => {
    const { repo, getRows, callsOf } = makeInMemoryRepo([makeRow({ teleworkPhotoNoticeId: 41 })], {
      template: makeTemplate(),
    })
    const service = new TeleworkPhotoNoticeService(repo)

    await service.discardDraft(5)

    const softDeleteCalls = callsOf('softDeleteDraft')
    assert.lengthOf(softDeleteCalls, 1)
    assert.deepEqual(softDeleteCalls[0].args, [41, 5])
    assert.lengthOf(callsOf('markAsPublished'), 0, 'descartar no publica')
    assert.lengthOf(callsOf('clearCurrentFlag'), 0, 'descartar no apaga la vigente')
    assert.isNotNull(getRows()[0].deletedAt)
  })
})

// ---------------------------------------------------------------------------
// listVersions — CA-05, CA-12
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.listVersions', () => {
  test('Objetivo: CA-05 — las versiones salen descendentes, sin borradores y con el conteo de cada una', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 1,
          teleworkPhotoNoticeVersion: 1,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeTitle: 'Aviso v1',
          teleworkPhotoNoticeRenderedContent: '<p>Aviso v1</p>',
          teleworkPhotoNoticeContentHash: 'hash-v1',
          publishedAt: DateTime.fromISO('2026-05-01T10:00:00'),
        }),
        makeRow({
          teleworkPhotoNoticeId: 2,
          teleworkPhotoNoticeVersion: 2,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeIsCurrent: true,
          teleworkPhotoNoticeTitle: 'Aviso v2',
          teleworkPhotoNoticeRenderedContent: '<p>Aviso v2 con Empresa Cinco SA de CV</p>',
          teleworkPhotoNoticeContentHash: 'hash-v2',
          publishedByUserId: 9,
          publishedAt: DateTime.fromISO('2026-06-01T10:00:00'),
        }),
        makeRow({ teleworkPhotoNoticeId: 3, teleworkPhotoNoticeVersion: 3 }),
      ],
      {
        template: makeTemplate(),
        acknowledgements: [{ businessUnitId: 5, teleworkPhotoNoticeId: 1, employeeId: 10 }],
      }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const versions = await service.listVersions(5)

    assert.lengthOf(versions, 2, 'el borrador vivo no se lista')
    assert.deepEqual(
      versions.map((version) => version.version),
      [2, 1]
    )
    assert.deepEqual(
      versions.map((version) => version.acknowledgementsCount),
      [0, 1]
    )
    assert.deepEqual(
      versions.map((version) => version.teleworkPhotoNoticeId),
      [2, 1]
    )
    assert.equal(versions[0].status, 'published')
    assert.isTrue(versions[0].isCurrent)
    assert.equal(versions[0].contentHash, 'hash-v2')
    assert.equal(versions[0].content, '<p>Aviso v2 con Empresa Cinco SA de CV</p>')
    assert.equal(versions[0].publishedByName, 'Root Nueve')
    assert.equal(versions[0].publishedByUserId, 9)
    assert.isString(versions[0].publishedAt)
    assert.include(versions[0].publishedAt, '2026-06-01')
    assert.isNull(versions[1].publishedByName, 'sin usuario publicador resoluble')
    assert.include(versions[1].publishedAt, '2026-05-01')
  })

  test('Objetivo: CA-05 y CA-12 — sin versiones publicadas la lista es vacía y no es 404', async ({
    assert,
  }) => {
    const { repo, getCalls, callsOf } = makeInMemoryRepo([makeRow({ teleworkPhotoNoticeId: 3 })], {
      template: makeTemplate(),
    })
    const service = new TeleworkPhotoNoticeService(repo)

    const versions = await service.listVersions(5)

    assert.deepEqual(versions, [])
    assert.lengthOf(
      callsOf('listPublishedVersions'),
      1,
      'la lista vacía sale de consultar las versiones publicadas, no de no consultar nada'
    )
    assert.notInclude(getCalls().map((call) => call.method), 'findTemplateCurrent')
  })
})

// ---------------------------------------------------------------------------
// hasAcknowledgedCurrent — CA-15
// ---------------------------------------------------------------------------
test.group('TeleworkPhotoNoticeService.hasAcknowledgedCurrent', () => {
  function makePublishedRow(overrides: Partial<FakeRow> = {}) {
    return makeRow({
      teleworkPhotoNoticeStatus: 'published',
      teleworkPhotoNoticeIsCurrent: true,
      teleworkPhotoNoticeRenderedContent: '<p>Aviso publicado</p>',
      ...overrides,
    })
  }

  test('Objetivo: CA-15 — hasAcknowledgedCurrent responde por la vigente y solo por ella', async ({
    assert,
  }) => {
    // (a) sin publicada ⇒ false sin consultar acuses
    const without = makeInMemoryRepo([], { template: makeTemplate() })
    const serviceWithout = new TeleworkPhotoNoticeService(without.repo)
    assert.isFalse(await serviceWithout.hasAcknowledgedCurrent(5, 10))
    assert.lengthOf(without.callsOf('hasAcknowledgement'), 0)

    // (b) acuse del empleado 10 en la vigente ⇒ true
    const seeded = makeInMemoryRepo([makePublishedRow({ teleworkPhotoNoticeId: 1 })], {
      template: makeTemplate(),
      acknowledgements: [{ businessUnitId: 5, teleworkPhotoNoticeId: 1, employeeId: 10 }],
    })
    const service = new TeleworkPhotoNoticeService(seeded.repo)
    assert.isTrue(await service.hasAcknowledgedCurrent(5, 10))
    assert.isFalse(await service.hasAcknowledgedCurrent(5, 11))

    // (c) tras publicar la v2 ⇒ false y la fila del acuse de v1 sigue en el repo
    const rows = seeded.getRows()
    const v1 = rows.find((row) => row.teleworkPhotoNoticeId === 1)!
    v1.teleworkPhotoNoticeIsCurrent = false
    rows.push(
      makePublishedRow({
        teleworkPhotoNoticeId: 2,
        teleworkPhotoNoticeVersion: 2,
        teleworkPhotoNoticeRenderedContent: '<p>Aviso v2</p>',
      })
    )
    assert.isFalse(await service.hasAcknowledgedCurrent(5, 10))
    assert.lengthOf(
      seeded.getAcknowledgements().filter((ack) => ack.employeeId === 10),
      1,
      'el acuse de la v1 no se toca al publicar la v2'
    )

    // (d) un acuse de la empresa 6 no hace true la consulta de la empresa 5
    const otherBusinessUnit = makeInMemoryRepo([makePublishedRow({ teleworkPhotoNoticeId: 1 })], {
      template: makeTemplate(),
      acknowledgements: [{ businessUnitId: 6, teleworkPhotoNoticeId: 1, employeeId: 10 }],
    })
    const serviceOther = new TeleworkPhotoNoticeService(otherBusinessUnit.repo)
    assert.isFalse(await serviceOther.hasAcknowledgedCurrent(5, 10))
  })

  test('Objetivo: CA-15(e) — businessUnitId o employeeId inválido lanza sin consultar', async ({
    assert,
  }) => {
    const { repo, getCalls } = makeInMemoryRepo([makePublishedRow({ teleworkPhotoNoticeId: 1 })], {
      template: makeTemplate(),
      acknowledgements: [{ businessUnitId: 5, teleworkPhotoNoticeId: 1, employeeId: 10 }],
    })
    const service = new TeleworkPhotoNoticeService(repo)

    for (const invalid of [
      () => service.hasAcknowledgedCurrent(0, 10),
      () => service.hasAcknowledgedCurrent(5, 0),
      () => service.hasAcknowledgedCurrent(5, -1),
    ]) {
      const thrown = await captureRejection(invalid())
      assert.instanceOf(thrown, TeleworkPhotoNoticeError)
      assert.equal((thrown as TeleworkPhotoNoticeError).key, 'aviso-no-publicado')
    }

    assert.lengthOf(getCalls(), 0, 'ningún método del repositorio debe consultarse')
    const recordedMethods = getCalls().map((call) => call.method)
    for (const method of NOTICE_LIMIT_METHODS) {
      assert.notInclude(recordedMethods, method, `${method} no debe consultarse`)
    }
  })
})

// ---------------------------------------------------------------------------
// publish — parte 2: marcadores, saneado, huella y transacción (CA-03, CA-04,
// CA-06, CA-07, CA-10 y Review Focus 1)
// ---------------------------------------------------------------------------

/** Empresa con marcado en su razón social: el valor debe viajar escapado, nunca como HTML. */
const RICH_LEGAL_NAME = 'Acme <b>& Hijos</b>'
const ESCAPED_LEGAL_NAME = 'Acme &lt;b&gt;&amp; Hijos&lt;/b&gt;'

test.group('TeleworkPhotoNoticeService.publish', () => {
  test('Objetivo: CA-03 — publicar resuelve el marcador con el valor escapado y sella la versión', async ({
    assert,
  }) => {
    const draftContent = 'La empresa {{razon_social}} informa.'
    const { repo, getRows, callsOf } = makeInMemoryRepo(
      [makeRow({ teleworkPhotoNoticeId: 50, teleworkPhotoNoticeContent: draftContent })],
      { template: makeTemplate(), businessUnitLegalNames: { 5: RICH_LEGAL_NAME } }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const dto = await service.publish(5, 9)

    assert.equal(dto.status, 'published')
    assert.equal(dto.version, 1)
    assert.isTrue(dto.isCurrent)
    assert.equal(dto.publishedByUserId, 9)
    assert.isString(dto.publishedAt)
    assert.isNotEmpty(dto.publishedAt, 'la versión queda sellada con su fecha')
    assert.equal(dto.content, `La empresa ${ESCAPED_LEGAL_NAME} informa.`)
    assert.equal(dto.acknowledgementsCount, 0, 'la versión recién nacida no tiene acuses')

    const row = getRows()[0]
    assert.equal(
      row.teleworkPhotoNoticeContent,
      draftContent,
      'la fila guardada conserva el texto CON el marcador'
    )
    assert.equal(row.teleworkPhotoNoticeRenderedContent, `La empresa ${ESCAPED_LEGAL_NAME} informa.`)
    assert.equal(row.teleworkPhotoNoticeStatus, 'published')
    assert.isTrue(row.teleworkPhotoNoticeIsCurrent)
    assert.isNotNull(row.publishedAt)
    assert.equal(row.publishedByUserId, 9)
    assert.deepEqual(callsOf('markAsPublished')[0].args[0], 50)

    assert.equal(
      dto.contentHash,
      createHash('sha256').update(`${dto.title}\n${dto.content}`, 'utf8').digest('hex'),
      'la huella se recalcula con el título y el texto resuelto del DTO'
    )
  })

  test('Objetivo: Review Focus 1 — un marcador con espacios internos se resuelve y todas sus apariciones se sustituyen', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 51,
          teleworkPhotoNoticeContent: '{{ razon_social }} y otra vez {{razon_social}}',
        }),
      ],
      { template: makeTemplate(), businessUnitLegalNames: { 5: RICH_LEGAL_NAME } }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const dto = await service.publish(5, 9)

    assert.equal(
      dto.content,
      `${ESCAPED_LEGAL_NAME} y otra vez ${ESCAPED_LEGAL_NAME}`,
      'la detección es tolerante al espaciado y la sustitución reemplaza todas las apariciones'
    )
    assert.notInclude(dto.content, '{{', 'el texto publicado no contiene marcadores')
    assert.notInclude(getRows()[0].teleworkPhotoNoticeRenderedContent ?? '', '{{')
  })

  test('Objetivo: CA-06 — un marcador fuera de la lista rechaza la publicación y no toca la vigente', async ({
    assert,
  }) => {
    const publishedAt = DateTime.fromISO('2026-05-01T10:00:00')
    const { repo, getRows, callsOf } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 60,
          teleworkPhotoNoticeVersion: 1,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeIsCurrent: true,
          teleworkPhotoNoticeRenderedContent: '<p>Aviso vigente</p>',
          teleworkPhotoNoticeContentHash: 'hash-v1',
          publishedByUserId: 9,
          publishedAt,
        }),
        makeRow({
          teleworkPhotoNoticeId: 61,
          teleworkPhotoNoticeVersion: 2,
          teleworkPhotoNoticeContent: '{{domicilio}} y {{ correo }}',
        }),
      ],
      { template: makeTemplate() }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'marcador-no-reconocido')
    assert.deepEqual((thrown as TeleworkPhotoNoticeError).details?.placeholders, [
      'domicilio',
      'correo',
    ], 'los marcadores desconocidos salen sin repetir y en orden de aparición')

    assert.lengthOf(callsOf('clearCurrentFlag'), 0, 'nada se ha escrito todavía')
    assert.lengthOf(callsOf('markAsPublished'), 0)

    const rows = getRows()
    assert.isTrue(
      rows.find((row) => row.teleworkPhotoNoticeId === 60)!.teleworkPhotoNoticeIsCurrent,
      'la vigente anterior sigue vigente'
    )
    assert.equal(
      rows.find((row) => row.teleworkPhotoNoticeId === 61)!.teleworkPhotoNoticeStatus,
      'draft',
      'el borrador sigue en draft'
    )
  })

  test('Objetivo: CA-07 — un contenido que queda vacío tras sanear rechaza la publicación', async ({
    assert,
  }) => {
    const { repo, getRows, callsOf } = makeInMemoryRepo(
      [makeRow({ teleworkPhotoNoticeId: 70, teleworkPhotoNoticeContent: '<script>alert(1)</script>' })],
      { template: makeTemplate() }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'contenido-vacio')
    assert.lengthOf(callsOf('markAsPublished'), 0)
    assert.lengthOf(callsOf('clearCurrentFlag'), 0)
    assert.equal(getRows()[0].teleworkPhotoNoticeStatus, 'draft')
  })

  test('Objetivo: CA-04 — la v1 publicada no cambia y la v2 queda vigente', async ({ assert }) => {
    const v1PublishedAt = DateTime.fromISO('2026-05-01T10:00:00')
    const { repo, getRows, callsOf } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 80,
          teleworkPhotoNoticeVersion: 1,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeIsCurrent: true,
          teleworkPhotoNoticeContent: '<p>La empresa {{razon_social}}</p>',
          teleworkPhotoNoticeRenderedContent: '<p>La empresa Empresa Cinco SA de CV</p>',
          teleworkPhotoNoticeContentHash: 'hash-v1',
          publishedByUserId: 9,
          publishedAt: v1PublishedAt,
        }),
        makeRow({
          teleworkPhotoNoticeId: 81,
          teleworkPhotoNoticeVersion: 2,
          teleworkPhotoNoticeContent: '<p>La empresa {{razon_social}} (v2)</p>',
        }),
      ],
      { template: makeTemplate() }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const dto = await service.publish(5, 9)

    assert.equal(dto.version, 2)
    assert.isTrue(dto.isCurrent)
    assert.deepEqual(callsOf('clearCurrentFlag')[0].args[0], 80, 'se apaga la v1, no la nueva')

    const v1 = getRows().find((row) => row.teleworkPhotoNoticeId === 80)!
    assert.isFalse(v1.teleworkPhotoNoticeIsCurrent, 'la v1 deja de ser vigente')
    assert.equal(v1.teleworkPhotoNoticeStatus, 'published')
    assert.equal(v1.teleworkPhotoNoticeContent, '<p>La empresa {{razon_social}}</p>')
    assert.equal(v1.teleworkPhotoNoticeRenderedContent, '<p>La empresa Empresa Cinco SA de CV</p>')
    assert.equal(v1.teleworkPhotoNoticeContentHash, 'hash-v1')
    assert.equal(v1.publishedAt?.toISO(), v1PublishedAt.toISO())
    assert.equal(v1.publishedByUserId, 9)

    const v2 = getRows().find((row) => row.teleworkPhotoNoticeId === 81)!
    assert.isTrue(v2.teleworkPhotoNoticeIsCurrent)
    assert.equal(v2.teleworkPhotoNoticeStatus, 'published')
    assert.equal(
      v2.teleworkPhotoNoticeRenderedContent,
      '<p>La empresa Empresa Cinco SA de CV (v2)</p>'
    )
  })

  test('Objetivo: CA-10 — publicar sin borrador es borrador-no-encontrado y no escribe nada', async ({
    assert,
  }) => {
    const { repo, getCalls, callsOf } = makeInMemoryRepo(
      [
        makeRow({
          teleworkPhotoNoticeId: 90,
          teleworkPhotoNoticeVersion: 1,
          teleworkPhotoNoticeStatus: 'published',
          teleworkPhotoNoticeIsCurrent: true,
        }),
      ],
      { template: makeTemplate() }
    )
    const service = new TeleworkPhotoNoticeService(repo)

    const thrown = await captureRejection(service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPhotoNoticeError)
    assert.equal((thrown as TeleworkPhotoNoticeError).key, 'borrador-no-encontrado')
    assert.lengthOf(callsOf('markAsPublished'), 0)
    assert.lengthOf(callsOf('clearCurrentFlag'), 0)
    assert.deepEqual(
      getCalls().map((call) => call.method),
      ['findDraftByBusinessUnitForUpdate'],
      'la transacción se corta en la primera lectura: ni razón social ni vigente ni escrituras'
    )
  })

  test('Objetivo: el alcance no resuelto o la empresa inexistente rechazan la publicación sin escribir', async ({
    assert,
  }) => {
    // (a) businessUnitId inválido ⇒ falla cerrado ANTES de abrir transacción.
    const unresolved = makeInMemoryRepo([makeRow({ teleworkPhotoNoticeId: 91 })], {
      template: makeTemplate(),
    })
    const unresolvedThrown = await captureRejection(
      new TeleworkPhotoNoticeService(unresolved.repo).publish(0, 9)
    )
    assert.instanceOf(unresolvedThrown, TeleworkPhotoNoticeError)
    assert.equal((unresolvedThrown as TeleworkPhotoNoticeError).key, 'aviso-no-publicado')
    assert.lengthOf(unresolved.getCalls(), 0, 'cero llamadas al repositorio')

    // (b) empresa inexistente (razón social `null`) ⇒ falla cerrado sin publicar.
    const missingBusinessUnit = makeInMemoryRepo([makeRow({ teleworkPhotoNoticeId: 92 })], {
      template: makeTemplate(),
      businessUnitLegalNames: {},
    })
    const missingThrown = await captureRejection(
      new TeleworkPhotoNoticeService(missingBusinessUnit.repo).publish(5, 9)
    )
    assert.instanceOf(missingThrown, TeleworkPhotoNoticeError)
    assert.equal((missingThrown as TeleworkPhotoNoticeError).key, 'aviso-no-publicado')
    assert.lengthOf(missingBusinessUnit.callsOf('markAsPublished'), 0)
    assert.lengthOf(missingBusinessUnit.callsOf('clearCurrentFlag'), 0)
    assert.equal(missingBusinessUnit.getRows()[0].teleworkPhotoNoticeStatus, 'draft')
  })

  test('Objetivo: la huella del texto es la misma para el mismo título y texto resuelto, y distinta si cambia el texto', async ({
    assert,
  }) => {
    function publishContent(content: string) {
      const { repo } = makeInMemoryRepo(
        [makeRow({ teleworkPhotoNoticeId: 95, teleworkPhotoNoticeContent: content })],
        { template: makeTemplate() }
      )
      return new TeleworkPhotoNoticeService(repo).publish(5, 9)
    }

    const first = await publishContent('<p>La empresa {{razon_social}} informa.</p>')
    const second = await publishContent('<p>La empresa {{razon_social}} informa.</p>')
    const changed = await publishContent('<p>La empresa {{razon_social}} avisa.</p>')

    assert.equal(first.content, second.content)
    assert.equal(first.title, second.title)
    assert.equal(first.contentHash, second.contentHash, 'mismo título y texto ⇒ misma huella')
    assert.notEqual(first.contentHash, changed.contentHash, 'cambia el texto ⇒ cambia la huella')
    assert.match(first.contentHash, /^[0-9a-f]{64}$/, 'la huella es un SHA-256 en hex')
  })
})
