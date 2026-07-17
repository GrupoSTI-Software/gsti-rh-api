import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import TeleworkPolicyError from '#exceptions/telework_policy_error'
import TeleworkPolicyService from '#modules/telework-policy/telework_policy.service'
import type {
  CreateTeleworkPolicyData,
  MarkAsPublishedData,
  TeleworkPolicyRepository,
  UpdateTeleworkPolicyData,
} from '#modules/telework-policy/telework_policy.repository'
import type { TeleworkPolicyAcknowledgementRepository } from '#modules/telework-policy/telework_policy_acknowledgement.repository'
import type TeleworkPolicy from '#models/telework_policy'
import type TeleworkPolicyTemplate from '#models/telework_policy_template'
import type TeleworkPolicyAcknowledgement from '#models/telework_policy_acknowledgement'
import type TeleworkWorkerService from '#services/telework_worker_service'
import type { TeleworkWorkerRecipient } from '#services/telework_worker_service'
import type TeleworkPolicyNotificationService from '#modules/telework-policy/telework_policy_notification.service'
import { TELEWORK_POLICY_COMPONENT_KEYS } from '#constants/telework_policy'

/**
 * Unit — `TeleworkPolicyService` (USRH1783547655377): publish, nuevo
 * borrador desde la vigente, historial de versiones, seguimiento de acuses
 * y recordatorio. Mismo patrón que `legal_document.service.spec.ts`: repos
 * falsos en memoria + `db.transaction` real (sin mockear), sin BD real para
 * las entidades de negocio.
 */

function makeComponents(overrides: { emptyKey?: string } = {}) {
  return TELEWORK_POLICY_COMPONENT_KEYS.map((key, index) => ({
    key,
    clause: key.replace(/_/g, '.'),
    title: `Título ${key}`,
    body: key === overrides.emptyKey ? '' : `<p>Contenido de ${key}</p>`,
    required: true,
    order: index + 1,
  }))
}

type FakeUser = {
  userId: number
  userEmail: string
  person: { personFirstname: string; personLastname: string; personSecondLastname: string } | null
}

type FakeRow = {
  teleworkPolicyId: number
  businessUnitId: number
  teleworkPolicyVersion: number
  teleworkPolicyTitle: string
  teleworkPolicyComponents: ReturnType<typeof makeComponents>
  teleworkPolicyStatus: 'draft' | 'published'
  teleworkPolicyIsCurrent: boolean
  teleworkPolicyContentHash: string | null
  createdByUserId: number
  updatedByUserId: number
  publishedByUserId: number | null
  publishedAt: DateTime | null
  teleworkPolicyCreatedAt: DateTime
  teleworkPolicyUpdatedAt: DateTime
  deletedAt: DateTime | null
  publisher?: FakeUser | null
}

const FAKE_USERS: Record<number, FakeUser> = {
  9: {
    userId: 9,
    userEmail: 'root9@gsti-tests.local',
    person: { personFirstname: 'Root', personLastname: 'Nueve', personSecondLastname: '' },
  },
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    teleworkPolicyId: 1,
    businessUnitId: 5,
    teleworkPolicyVersion: 1,
    teleworkPolicyTitle: 'Política de Teletrabajo',
    teleworkPolicyComponents: makeComponents(),
    teleworkPolicyStatus: 'draft',
    teleworkPolicyIsCurrent: false,
    teleworkPolicyContentHash: null,
    createdByUserId: 9,
    updatedByUserId: 9,
    publishedByUserId: null,
    publishedAt: null,
    teleworkPolicyCreatedAt: DateTime.fromISO('2026-01-01T00:00:00'),
    teleworkPolicyUpdatedAt: DateTime.fromISO('2026-01-01T00:00:00'),
    deletedAt: null,
    ...overrides,
  }
}

function makeInMemoryRepo(seed: FakeRow[] = []) {
  const rows: FakeRow[] = seed.map((r) => ({ ...r }))
  let nextId = rows.length ? Math.max(...rows.map((r) => r.teleworkPolicyId)) + 1 : 1
  const calls: Array<{ method: string; args: unknown[] }> = []

  function attachPublisher(row: FakeRow) {
    row.publisher = row.publishedByUserId !== null ? FAKE_USERS[row.publishedByUserId] ?? null : null
  }

  const repo: TeleworkPolicyRepository = {
    async findTemplateCurrent() {
      return null as unknown as TeleworkPolicyTemplate | null
    },
    async findActiveByBusinessUnit(businessUnitId: number) {
      calls.push({ method: 'findActiveByBusinessUnit', args: [businessUnitId] })
      const found = rows
        .filter((r) => r.businessUnitId === businessUnitId && !r.deletedAt)
        .sort((a, b) => b.teleworkPolicyVersion - a.teleworkPolicyVersion)[0]
      if (found) attachPublisher(found)
      return (found ?? null) as unknown as TeleworkPolicy | null
    },
    async findActiveByBusinessUnitForUpdate(businessUnitId: number) {
      calls.push({ method: 'findActiveByBusinessUnitForUpdate', args: [businessUnitId] })
      const found = rows
        .filter((r) => r.businessUnitId === businessUnitId && !r.deletedAt)
        .sort((a, b) => b.teleworkPolicyVersion - a.teleworkPolicyVersion)[0]
      return (found ?? null) as unknown as TeleworkPolicy | null
    },
    async findCurrentByBusinessUnit(businessUnitId: number) {
      calls.push({ method: 'findCurrentByBusinessUnit', args: [businessUnitId] })
      const found = rows.find((r) => r.businessUnitId === businessUnitId && r.teleworkPolicyIsCurrent)
      if (found) attachPublisher(found)
      return (found ?? null) as unknown as TeleworkPolicy | null
    },
    async findCurrentByBusinessUnitForUpdate(businessUnitId: number) {
      calls.push({ method: 'findCurrentByBusinessUnitForUpdate', args: [businessUnitId] })
      const found = rows.find((r) => r.businessUnitId === businessUnitId && r.teleworkPolicyIsCurrent)
      return (found ?? null) as unknown as TeleworkPolicy | null
    },
    async clearCurrentFlag(teleworkPolicyId: number) {
      calls.push({ method: 'clearCurrentFlag', args: [teleworkPolicyId] })
      const row = rows.find((r) => r.teleworkPolicyId === teleworkPolicyId)
      if (!row) throw new Error(`fila ${teleworkPolicyId} no encontrada en el repo falso`)
      row.teleworkPolicyIsCurrent = false
    },
    async findMaxVersion(businessUnitId: number) {
      calls.push({ method: 'findMaxVersion', args: [businessUnitId] })
      const versions = rows
        .filter((r) => r.businessUnitId === businessUnitId)
        .map((r) => r.teleworkPolicyVersion)
      return versions.length ? Math.max(...versions) : 0
    },
    async createDraft(data: CreateTeleworkPolicyData) {
      calls.push({ method: 'createDraft', args: [data] })
      const row: FakeRow = {
        teleworkPolicyId: nextId++,
        businessUnitId: data.businessUnitId,
        teleworkPolicyVersion: data.version,
        teleworkPolicyTitle: data.title,
        teleworkPolicyComponents: data.components as ReturnType<typeof makeComponents>,
        teleworkPolicyStatus: 'draft',
        teleworkPolicyIsCurrent: false,
        teleworkPolicyContentHash: null,
        createdByUserId: data.createdByUserId,
        updatedByUserId: data.createdByUserId,
        publishedByUserId: null,
        publishedAt: null,
        teleworkPolicyCreatedAt: DateTime.now(),
        teleworkPolicyUpdatedAt: DateTime.now(),
        deletedAt: null,
      }
      rows.push(row)
      return row as unknown as TeleworkPolicy
    },
    async updateDraft(teleworkPolicyId: number, data: UpdateTeleworkPolicyData) {
      calls.push({ method: 'updateDraft', args: [teleworkPolicyId, data] })
      const row = rows.find((r) => r.teleworkPolicyId === teleworkPolicyId)
      if (!row) throw new Error(`fila ${teleworkPolicyId} no encontrada en el repo falso`)
      row.teleworkPolicyTitle = data.title
      row.teleworkPolicyComponents = data.components as ReturnType<typeof makeComponents>
      row.updatedByUserId = data.updatedByUserId
      return row as unknown as TeleworkPolicy
    },
    async softDeleteDraft(teleworkPolicyId: number) {
      calls.push({ method: 'softDeleteDraft', args: [teleworkPolicyId] })
      const row = rows.find((r) => r.teleworkPolicyId === teleworkPolicyId)
      if (!row) throw new Error(`fila ${teleworkPolicyId} no encontrada en el repo falso`)
      row.deletedAt = DateTime.now()
    },
    async markAsPublished(teleworkPolicyId: number, data: MarkAsPublishedData) {
      calls.push({ method: 'markAsPublished', args: [teleworkPolicyId, data] })
      const row = rows.find((r) => r.teleworkPolicyId === teleworkPolicyId)
      if (!row) throw new Error(`fila ${teleworkPolicyId} no encontrada en el repo falso`)
      row.teleworkPolicyStatus = 'published'
      row.teleworkPolicyIsCurrent = true
      row.teleworkPolicyContentHash = data.contentHash
      row.publishedByUserId = data.publishedByUserId
      row.publishedAt = DateTime.now()
      attachPublisher(row)
      return row as unknown as TeleworkPolicy
    },
    async listVersions(businessUnitId: number) {
      calls.push({ method: 'listVersions', args: [businessUnitId] })
      const found = rows
        .filter((r) => r.businessUnitId === businessUnitId && !r.deletedAt)
        .sort((a, b) => b.teleworkPolicyVersion - a.teleworkPolicyVersion)
      found.forEach(attachPublisher)
      return found as unknown as TeleworkPolicy[]
    },
  }

  return { repo, getRows: () => rows, getCalls: () => calls }
}

function makeFakeAcknowledgementRepo(
  acknowledgements: Array<{ employeeId: number; version: number; acknowledgedAt: DateTime }> = []
) {
  const repo: TeleworkPolicyAcknowledgementRepository = {
    async listByBusinessUnit() {
      return acknowledgements.map((ack) => ({
        employeeId: ack.employeeId,
        teleworkPolicyAcknowledgementAcknowledgedAt: ack.acknowledgedAt,
        policy: { teleworkPolicyVersion: ack.version },
      })) as unknown as TeleworkPolicyAcknowledgement[]
    },
  }
  return repo
}

function makeFakeWorkerService(recipients: TeleworkWorkerRecipient[]) {
  const calls: unknown[][] = []
  const fake = {
    async listAllForNotification(scope: number[]) {
      calls.push([scope])
      return recipients
    },
  }
  return { workerService: fake as unknown as TeleworkWorkerService, getCalls: () => calls }
}

function makeFakeNotificationService() {
  const calls: Array<{ policy: unknown; recipients: unknown; type: string; actorUserId: unknown }> = []
  const fake = {
    async send(policy: unknown, recipients: unknown, type: string, actorUserId: unknown) {
      calls.push({ policy, recipients, type, actorUserId })
      const total = (recipients as unknown[]).length
      return { total, sent: total, failed: 0, skipped: 0 }
    },
  }
  return {
    notificationService: fake as unknown as TeleworkPolicyNotificationService,
    getCalls: () => calls,
  }
}

function makeRecipient(overrides: Partial<TeleworkWorkerRecipient> = {}): TeleworkWorkerRecipient {
  return {
    employeeId: 1,
    employeeCode: 'EMP-1',
    fullName: 'Empleado Uno',
    position: 'Analista',
    email: 'empleado1@example.com',
    ...overrides,
  }
}

async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return err
  }
}

// ---------------------------------------------------------------------------
// publish — regla de negocio 1, 2, 3, 13
// ---------------------------------------------------------------------------
test.group('TeleworkPolicyService.publish', () => {
  test('422 politica-incompleta-para-publicar si algún componente sigue vacío (regla 13)', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyComponents: makeComponents({ emptyKey: '5_2_h' }) }),
    ])
    const { workerService } = makeFakeWorkerService([])
    const { notificationService, getCalls } = makeFakeNotificationService()
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      workerService,
      notificationService
    )

    const thrown = await catchAsync(() => service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'politica-incompleta-para-publicar')
    assert.deepEqual((thrown as TeleworkPolicyError).details?.missingKeys, ['5_2_h'])
    assert.lengthOf(getCalls(), 0, 'no debe difundir si la publicación falló')
  })

  test('404 politica-inexistente si la empresa no tiene ninguna fila activa', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const thrown = await catchAsync(() => service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'politica-inexistente')
  })

  test('409 politica-publicada-inmutable si la fila activa ya está publicada', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyStatus: 'published', teleworkPolicyIsCurrent: true }),
    ])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const thrown = await catchAsync(() => service.publish(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'politica-publicada-inmutable')
  })

  test('feliz: sella contenido, apaga la vigente anterior y difunde a los destinatarios', async ({
    assert,
  }) => {
    const { repo, getRows } = makeInMemoryRepo([
      makeRow({
        teleworkPolicyId: 1,
        teleworkPolicyVersion: 1,
        teleworkPolicyStatus: 'published',
        teleworkPolicyIsCurrent: true,
        publishedByUserId: 9,
      }),
      makeRow({ teleworkPolicyId: 2, teleworkPolicyVersion: 2, teleworkPolicyStatus: 'draft' }),
    ])
    const recipients = [makeRecipient({ employeeId: 1 }), makeRecipient({ employeeId: 2, email: '' })]
    const { workerService } = makeFakeWorkerService(recipients)
    const { notificationService, getCalls } = makeFakeNotificationService()
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      workerService,
      notificationService
    )

    const result = await service.publish(5, 9)

    assert.equal(result.policy.status, 'published')
    assert.isTrue(result.policy.isCurrent)
    assert.isString(result.policy.contentHash)
    assert.isNotNull(result.policy.publishedAt)
    assert.equal(result.diffusion.total, 2)

    const rows = getRows()
    const previousVersion = rows.find((r) => r.teleworkPolicyVersion === 1)!
    assert.isFalse(previousVersion.teleworkPolicyIsCurrent, 'la versión anterior debe apagarse')

    const notificationCalls = getCalls()
    assert.lengthOf(notificationCalls, 1)
    assert.equal(notificationCalls[0].type, 'publication')
  })
})

// ---------------------------------------------------------------------------
// createDraftFromLatest — regla de negocio 12
// ---------------------------------------------------------------------------
test.group('TeleworkPolicyService.createDraftFromLatest', () => {
  function makeService(repo: TeleworkPolicyRepository) {
    return new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )
  }

  test('409 borrador-ya-existe si ya hay un borrador activo', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([makeRow({ teleworkPolicyStatus: 'draft' })])
    const service = makeService(repo)

    const thrown = await catchAsync(() => service.createDraftFromLatest(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'borrador-ya-existe')
  })

  test('404 politica-inexistente si la empresa nunca ha tenido absolutamente nada', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([])
    const service = makeService(repo)

    const thrown = await catchAsync(() => service.createDraftFromLatest(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'politica-inexistente')
  })

  test('404 sin-version-vigente si hubo actividad previa pero nunca se publicó', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyStatus: 'draft', deletedAt: DateTime.now() }),
    ])
    const service = makeService(repo)

    const thrown = await catchAsync(() => service.createDraftFromLatest(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'sin-version-vigente')
  })

  test('feliz: clona título y componentes de la vigente, version = max + 1', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({
        teleworkPolicyId: 1,
        teleworkPolicyVersion: 3,
        teleworkPolicyStatus: 'published',
        teleworkPolicyIsCurrent: true,
        teleworkPolicyTitle: 'Política vigente',
        publishedByUserId: 9,
      }),
    ])
    const service = makeService(repo)

    const result = await service.createDraftFromLatest(5, 9)

    assert.equal(result.version, 4)
    assert.equal(result.status, 'draft')
    assert.isFalse(result.isCurrent)
    assert.equal(result.title, 'Política vigente')
    assert.lengthOf(result.components, TELEWORK_POLICY_COMPONENT_KEYS.length)
  })
})

// ---------------------------------------------------------------------------
// listVersions
// ---------------------------------------------------------------------------
test.group('TeleworkPolicyService.listVersions', () => {
  test('404 politica-inexistente si la empresa no tiene ninguna versión', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const thrown = await catchAsync(() => service.listVersions(5))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'politica-inexistente')
  })

  test('devuelve el historial de la más reciente a la más antigua', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 1, teleworkPolicyStatus: 'published' }),
      makeRow({ teleworkPolicyId: 2, teleworkPolicyVersion: 2, teleworkPolicyStatus: 'draft' }),
    ])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const versions = await service.listVersions(5)

    assert.lengthOf(versions, 2)
    assert.equal(versions[0].version, 2)
    assert.equal(versions[1].version, 1)
  })
})

// ---------------------------------------------------------------------------
// getAcknowledgementTracking — regla de negocio 6, 7
// ---------------------------------------------------------------------------
test.group('TeleworkPolicyService.getAcknowledgementTracking', () => {
  test('hasCurrentVersion=false si aún no hay ninguna versión publicada', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const tracking = await service.getAcknowledgementTracking(5)

    assert.isFalse(tracking.hasCurrentVersion)
    assert.lengthOf(tracking.workers, 0)
    assert.deepEqual(tracking.summary, {
      total: 0,
      acknowledged: 0,
      outdated: 0,
      pending: 0,
      withoutEmail: 0,
    })
  })

  test('clasifica acknowledged / outdated / pending y detecta sin correo', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 2, teleworkPolicyIsCurrent: true, teleworkPolicyStatus: 'published' }),
    ])
    const acknowledgementRepo = makeFakeAcknowledgementRepo([
      { employeeId: 1, version: 2, acknowledgedAt: DateTime.fromISO('2026-07-15T13:00:00') },
      { employeeId: 2, version: 1, acknowledgedAt: DateTime.fromISO('2026-06-01T09:00:00') },
    ])
    const recipients = [
      makeRecipient({ employeeId: 1 }),
      makeRecipient({ employeeId: 2 }),
      makeRecipient({ employeeId: 3, email: '' }),
    ]
    const service = new TeleworkPolicyService(
      repo,
      acknowledgementRepo,
      makeFakeWorkerService(recipients).workerService,
      makeFakeNotificationService().notificationService
    )

    const tracking = await service.getAcknowledgementTracking(5)

    assert.isTrue(tracking.hasCurrentVersion)
    assert.equal(tracking.currentVersion, 2)
    assert.equal(tracking.summary.total, 3)
    assert.equal(tracking.summary.acknowledged, 1)
    assert.equal(tracking.summary.outdated, 1)
    assert.equal(tracking.summary.pending, 1)
    assert.equal(tracking.summary.withoutEmail, 1)

    const byId = new Map(tracking.workers.map((w) => [w.employeeId, w]))
    assert.equal(byId.get(1)!.status, 'acknowledged')
    assert.equal(byId.get(2)!.status, 'outdated')
    assert.equal(byId.get(3)!.status, 'pending')
    assert.isFalse(byId.get(3)!.hasEmail)
  })

  test('un alta posterior a la publicación (sin ningún acuse) aparece pendiente automáticamente', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 1, teleworkPolicyIsCurrent: true, teleworkPolicyStatus: 'published' }),
    ])
    const recipients = [makeRecipient({ employeeId: 99 })]
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo([]),
      makeFakeWorkerService(recipients).workerService,
      makeFakeNotificationService().notificationService
    )

    const tracking = await service.getAcknowledgementTracking(5)

    assert.equal(tracking.summary.pending, 1)
    assert.equal(tracking.workers[0].status, 'pending')
  })
})

// ---------------------------------------------------------------------------
// remindPending — regla de negocio 4, 10
// ---------------------------------------------------------------------------
test.group('TeleworkPolicyService.remindPending', () => {
  test('404 sin-version-vigente si la empresa nunca ha publicado', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([])
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo(),
      makeFakeWorkerService([]).workerService,
      makeFakeNotificationService().notificationService
    )

    const thrown = await catchAsync(() => service.remindPending(5, 9))

    assert.instanceOf(thrown, TeleworkPolicyError)
    assert.equal((thrown as TeleworkPolicyError).key, 'sin-version-vigente')
  })

  test('masivo (sin employeeIds): envía a todos los outdated + pending, nunca a los acknowledged', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 2, teleworkPolicyIsCurrent: true, teleworkPolicyStatus: 'published' }),
    ])
    const acknowledgementRepo = makeFakeAcknowledgementRepo([
      { employeeId: 1, version: 2, acknowledgedAt: DateTime.now() }, // acknowledged
      { employeeId: 2, version: 1, acknowledgedAt: DateTime.now() }, // outdated
    ])
    const recipients = [
      makeRecipient({ employeeId: 1 }),
      makeRecipient({ employeeId: 2 }),
      makeRecipient({ employeeId: 3 }), // pending
    ]
    const { notificationService, getCalls } = makeFakeNotificationService()
    const service = new TeleworkPolicyService(
      repo,
      acknowledgementRepo,
      makeFakeWorkerService(recipients).workerService,
      notificationService
    )

    const result = await service.remindPending(5, 9)

    assert.equal(result.pendingTotal, 2)
    assert.equal(result.total, 2)
    const call = getCalls()[0]
    const sentEmployeeIds = (call.recipients as TeleworkWorkerRecipient[]).map((r) => r.employeeId)
    assert.sameMembers(sentEmployeeIds, [2, 3])
    assert.equal(call.type, 'reminder')
  })

  test('selectivo (con employeeIds): intersecta con los pendientes reales, ignora ids ajenos', async ({
    assert,
  }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 1, teleworkPolicyIsCurrent: true, teleworkPolicyStatus: 'published' }),
    ])
    const recipients = [
      makeRecipient({ employeeId: 1 }),
      makeRecipient({ employeeId: 2 }),
      makeRecipient({ employeeId: 3 }),
    ]
    const { notificationService, getCalls } = makeFakeNotificationService()
    const service = new TeleworkPolicyService(
      repo,
      makeFakeAcknowledgementRepo([]),
      makeFakeWorkerService(recipients).workerService,
      notificationService
    )

    // 999 no pertenece al conjunto 5.1: se ignora en silencio.
    const result = await service.remindPending(5, 9, [1, 999])

    assert.equal(result.pendingTotal, 3)
    assert.equal(result.total, 1)
    const call = getCalls()[0]
    const sentEmployeeIds = (call.recipients as TeleworkWorkerRecipient[]).map((r) => r.employeeId)
    assert.deepEqual(sentEmployeeIds, [1])
  })

  test('0 pendientes es idempotente: no llama al servicio de notificación', async ({ assert }) => {
    const { repo } = makeInMemoryRepo([
      makeRow({ teleworkPolicyId: 1, teleworkPolicyVersion: 1, teleworkPolicyIsCurrent: true, teleworkPolicyStatus: 'published' }),
    ])
    const acknowledgementRepo = makeFakeAcknowledgementRepo([
      { employeeId: 1, version: 1, acknowledgedAt: DateTime.now() },
    ])
    const recipients = [makeRecipient({ employeeId: 1 })]
    const { notificationService, getCalls } = makeFakeNotificationService()
    const service = new TeleworkPolicyService(
      repo,
      acknowledgementRepo,
      makeFakeWorkerService(recipients).workerService,
      notificationService
    )

    const result = await service.remindPending(5, 9)

    assert.equal(result.pendingTotal, 0)
    assert.equal(result.total, 0)
    assert.equal(result.sent, 0)
    assert.lengthOf(getCalls(), 0)
  })
})
