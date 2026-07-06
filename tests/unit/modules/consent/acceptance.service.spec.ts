import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ConsentError from '#exceptions/consent_error'
import UserConsent from '#models/user_consent'
import AcceptanceService from '../../../../app/modules/consent/acceptance/acceptance.service.js'
import type {
  AcceptanceDocumentInput,
  AcceptanceEvidence,
  AcceptanceRepository,
} from '../../../../app/modules/consent/acceptance/acceptance.repository.js'
import type { LegalDocumentRepository } from '../../../../app/modules/legal-documents/legal_document.repository.js'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType } from '#models/legal_document'

// ---------------------------------------------------------------------------
// Fakes en memoria (mismo patrón que tests/unit/modules/legal-documents):
// mockear las interfaces de los dos repositorios que consume el service, sin BD.
// ---------------------------------------------------------------------------

type FakeLegalDocRow = {
  legalDocumentId: number
  legalDocumentType: LegalDocumentType
  legalDocumentVersion: string
}

function makeLegalDocumentRepo(seed: FakeLegalDocRow[]): LegalDocumentRepository {
  return {
    async findCurrentByType(type) {
      const row = seed.find((r) => r.legalDocumentType === type)
      return (row ?? null) as unknown as LegalDocument | null
    },
    async findCurrentByTypeForUpdate(type) {
      const row = seed.find((r) => r.legalDocumentType === type)
      return (row ?? null) as unknown as LegalDocument | null
    },
    async clearCurrentFlag() {},
    async createPublishedVersion() {
      throw new Error('no usado en estos tests')
    },
  }
}

type FakeAcceptanceRow = {
  userId: number
  legalDocumentId: number
  userConsentDocumentVersion: string
  userConsentAcceptedAt: DateTime
  userConsentIp: string | null
  userConsentUserAgent: string | null
}

function makeAcceptanceRepo(seed: FakeAcceptanceRow[] = []) {
  const rows: FakeAcceptanceRow[] = seed.map((r) => ({ ...r }))
  const calls: Array<{ method: string; args: unknown[] }> = []

  const repo: AcceptanceRepository = {
    async findAcceptancesByUser(userId: number) {
      calls.push({ method: 'findAcceptancesByUser', args: [userId] })
      return rows.filter((r) => r.userId === userId) as unknown as UserConsent[]
    },
    async recordAcceptances(
      userId: number,
      documents: AcceptanceDocumentInput[],
      evidence: AcceptanceEvidence,
      acceptedAt: Date
    ) {
      calls.push({ method: 'recordAcceptances', args: [userId, documents, evidence, acceptedAt] })
      const created: FakeAcceptanceRow[] = []
      for (const doc of documents) {
        const existing = rows.find(
          (r) => r.userId === userId && r.legalDocumentId === doc.legalDocumentId
        )
        if (existing) {
          created.push(existing)
          continue
        }
        const row: FakeAcceptanceRow = {
          userId,
          legalDocumentId: doc.legalDocumentId,
          userConsentDocumentVersion: doc.documentVersion,
          userConsentAcceptedAt: DateTime.fromJSDate(acceptedAt),
          userConsentIp: evidence.ip,
          userConsentUserAgent: evidence.userAgent,
        }
        rows.push(row)
        created.push(row)
      }
      return created as unknown as UserConsent[]
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

const PRIVACY_DOC: FakeLegalDocRow = {
  legalDocumentId: 2,
  legalDocumentType: 'privacy_notice',
  legalDocumentVersion: '1.0',
}
const TERMS_DOC: FakeLegalDocRow = {
  legalDocumentId: 1,
  legalDocumentType: 'terms_conditions',
  legalDocumentVersion: '1.0',
}

// ---------------------------------------------------------------------------
// getStatus — cálculo de pendingDocuments por audiencia (reglas de negocio 3, 4 y 6)
// ---------------------------------------------------------------------------
test.group('AcceptanceService.getStatus', () => {
  test('audiencia web sin aceptar nada: pendingDocuments = [privacy, terms], accepted=false', async ({
    assert,
  }) => {
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.getStatus(100, 'web')

    assert.isFalse(status.accepted)
    assert.lengthOf(status.pendingDocuments, 2)
    assert.sameMembers(
      status.pendingDocuments.map((d) => d.type),
      ['privacy_notice', 'terms_conditions']
    )
    assert.isNull(status.acceptedAt)
    assert.isNull(status.acceptedVersion)
    assert.equal(status.currentVersion, '1.0')
  })

  test('audiencia app con biométrico sin versión vigente: nunca aparece como pendiente', async ({
    assert,
  }) => {
    // biometric_consent no está sembrado en legal_documents (aún no publicado)
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.getStatus(100, 'app')

    assert.lengthOf(status.pendingDocuments, 2)
    assert.isFalse(status.pendingDocuments.some((d) => d.type === 'biometric_consent'))
  })

  test('usuario que ya aceptó ambos documentos web: pendingDocuments vacío, accepted=true', async ({
    assert,
  }) => {
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const acceptedAt = DateTime.fromISO('2026-05-01T10:00:00')
    const { repo: acceptanceRepo } = makeAcceptanceRepo([
      {
        userId: 100,
        legalDocumentId: PRIVACY_DOC.legalDocumentId,
        userConsentDocumentVersion: '1.0',
        userConsentAcceptedAt: acceptedAt,
        userConsentIp: null,
        userConsentUserAgent: null,
      },
      {
        userId: 100,
        legalDocumentId: TERMS_DOC.legalDocumentId,
        userConsentDocumentVersion: '1.0',
        userConsentAcceptedAt: acceptedAt,
        userConsentIp: null,
        userConsentUserAgent: null,
      },
    ])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.getStatus(100, 'web')

    assert.isTrue(status.accepted)
    assert.lengthOf(status.pendingDocuments, 0)
    assert.equal(status.acceptedVersion, '1.0')
    assert.equal(status.acceptedAt, acceptedAt.toISO())
  })

  test('regla 5 (re-consentimiento): si se publica una nueva versión vigente, la aceptación de la versión vieja ya no cuenta como al día', async ({
    assert,
  }) => {
    // El usuario aceptó terms_conditions v1.0 (legalDocumentId=1), pero luego se publicó
    // v2.0 (legalDocumentId=10, un legal_document_id NUEVO — así publica LegalDocumentService:
    // apaga la vieja, crea una fila nueva). La aceptación vieja está ligada al id viejo, así
    // que el documento debe volver a aparecer como pendiente contra la versión nueva.
    const termsV2: FakeLegalDocRow = {
      legalDocumentId: 10,
      legalDocumentType: 'terms_conditions',
      legalDocumentVersion: '2.0',
    }
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, termsV2])
    const { repo: acceptanceRepo } = makeAcceptanceRepo([
      {
        userId: 100,
        legalDocumentId: PRIVACY_DOC.legalDocumentId,
        userConsentDocumentVersion: '1.0',
        userConsentAcceptedAt: DateTime.fromISO('2026-01-01T00:00:00'),
        userConsentIp: null,
        userConsentUserAgent: null,
      },
      {
        userId: 100,
        legalDocumentId: TERMS_DOC.legalDocumentId, // ligado al viejo legalDocumentId=1 (v1.0)
        userConsentDocumentVersion: '1.0',
        userConsentAcceptedAt: DateTime.fromISO('2026-01-01T00:00:00'),
        userConsentIp: null,
        userConsentUserAgent: null,
      },
    ])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.getStatus(100, 'web')

    assert.isFalse(status.accepted)
    assert.lengthOf(status.pendingDocuments, 1)
    assert.equal(status.pendingDocuments[0].type, 'terms_conditions')
    assert.equal(status.pendingDocuments[0].version, '2.0')
  })

  test('no aísla por audiencia incorrectamente: web nunca exige biométrico aunque exista vigente', async ({
    assert,
  }) => {
    const biometricDoc: FakeLegalDocRow = {
      legalDocumentId: 3,
      legalDocumentType: 'biometric_consent',
      legalDocumentVersion: '1.0',
    }
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC, biometricDoc])
    const { repo: acceptanceRepo } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.getStatus(100, 'web')

    assert.isFalse(status.pendingDocuments.some((d) => d.type === 'biometric_consent'))
    assert.lengthOf(status.pendingDocuments, 2)
  })
})

// ---------------------------------------------------------------------------
// recordAcceptance — retrocompatibilidad, validación de versión e idempotencia
// ---------------------------------------------------------------------------
test.group('AcceptanceService.recordAcceptance', () => {
  test('retrocompatible: sin type, registra privacy_notice + terms_conditions y responde accepted:true', async ({
    assert,
  }) => {
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo, getRows } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const status = await service.recordAcceptance(100, 'web', {
      documentVersion: '1.0',
      ip: '203.0.113.10',
      userAgent: 'jest-agent/1.0',
    })

    assert.isTrue(status.accepted)
    assert.lengthOf(status.pendingDocuments, 0)
    assert.lengthOf(getRows(), 2)
    assert.sameMembers(
      getRows().map((r) => r.legalDocumentId),
      [PRIVACY_DOC.legalDocumentId, TERMS_DOC.legalDocumentId]
    )
  })

  test('con type explícito, registra solo ese documento (uso de la app para biométrico)', async ({
    assert,
  }) => {
    const biometricDoc: FakeLegalDocRow = {
      legalDocumentId: 3,
      legalDocumentType: 'biometric_consent',
      legalDocumentVersion: '1.0',
    }
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC, biometricDoc])
    const { repo: acceptanceRepo, getRows } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    await service.recordAcceptance(100, 'app', {
      documentVersion: '1.0',
      type: 'biometric_consent',
      ip: null,
      userAgent: null,
    })

    assert.lengthOf(getRows(), 1)
    assert.equal(getRows()[0].legalDocumentId, biometricDoc.legalDocumentId)
  })

  test('versión no vigente: lanza ConsentError con key/code de versión inválida, sin registrar nada', async ({
    assert,
  }) => {
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo, getRows } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const thrown = await catchAsync(() =>
      service.recordAcceptance(100, 'web', {
        documentVersion: '0.9',
        ip: null,
        userAgent: null,
      })
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'version-de-consentimiento-invalida')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.001')
    assert.lengthOf(getRows(), 0)
  })

  test('type sin versión vigente publicada: lanza ConsentError de tipo inválido', async ({
    assert,
  }) => {
    // biometric_consent no está sembrado en legal_documents
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    const thrown = await catchAsync(() =>
      service.recordAcceptance(100, 'app', {
        documentVersion: '1.0',
        type: 'biometric_consent',
        ip: null,
        userAgent: null,
      })
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'tipo-de-documento-invalido')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.002')
  })

  test('doble submit de la misma aceptación es idempotente: no duplica ni re-fecha', async ({
    assert,
  }) => {
    const legalDocs = makeLegalDocumentRepo([PRIVACY_DOC, TERMS_DOC])
    const { repo: acceptanceRepo, getRows } = makeAcceptanceRepo([])
    const service = new AcceptanceService(acceptanceRepo, legalDocs)

    await service.recordAcceptance(100, 'web', {
      documentVersion: '1.0',
      ip: '203.0.113.10',
      userAgent: 'first-agent',
    })
    const firstAcceptedAt = getRows().find(
      (r) => r.legalDocumentId === PRIVACY_DOC.legalDocumentId
    )!.userConsentAcceptedAt

    await service.recordAcceptance(100, 'web', {
      documentVersion: '1.0',
      ip: '198.51.100.20',
      userAgent: 'second-agent',
    })

    assert.lengthOf(getRows(), 2, 'no debe duplicar filas en el segundo envío')
    const privacyRow = getRows().find((r) => r.legalDocumentId === PRIVACY_DOC.legalDocumentId)!
    assert.equal(
      privacyRow.userConsentAcceptedAt.toISO(),
      firstAcceptedAt.toISO(),
      'no debe re-fechar la evidencia existente'
    )
    assert.equal(privacyRow.userConsentUserAgent, 'first-agent', 'no debe sobrescribir la evidencia original')
  })
})

// ---------------------------------------------------------------------------
// Cifrado fallo-CERRADO de userConsentIp/userConsentUserAgent (sin BD, directo al modelo)
// ---------------------------------------------------------------------------
test.group('UserConsent — cifrado fallo-cerrado de evidencia', () => {
  test('consume() devuelve null ante un valor corrupto en vez de lanzar o exponer el ciphertext', ({
    assert,
  }) => {
    const ipColumn = UserConsent.$getColumn('userConsentIp')
    const userAgentColumn = UserConsent.$getColumn('userConsentUserAgent')

    assert.exists(ipColumn)
    assert.exists(userAgentColumn)
    if (!ipColumn || !userAgentColumn) return

    const consumeIp = ipColumn.consume as (v: string | null) => string | null
    const consumeUserAgent = userAgentColumn.consume as (v: string | null) => string | null

    assert.isNull(consumeIp('esto-no-es-un-ciphertext-valido'))
    assert.isNull(consumeUserAgent('tampoco-esto'))
    assert.isNull(consumeIp(null))
  })

  test('prepare()/consume() son simétricos con un ciphertext real (round-trip)', ({ assert }) => {
    const ipColumn = UserConsent.$getColumn('userConsentIp')
    assert.exists(ipColumn)
    if (!ipColumn) return

    const prepareIp = ipColumn.prepare as (v: string | null) => string | null
    const consumeIp = ipColumn.consume as (v: string | null) => string | null

    const ciphertext = prepareIp('203.0.113.10')
    assert.isString(ciphertext)
    assert.notEqual(ciphertext, '203.0.113.10')
    assert.equal(consumeIp(ciphertext), '203.0.113.10')
  })
})
