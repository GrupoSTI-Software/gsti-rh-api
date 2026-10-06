import { test } from '@japa/runner'
import PlatformConsentError from '#exceptions/platform_consent_error'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import PlatformConsentService from '#modules/consent/platform/platform_consent.service'
import {
  toTenantLegalAcceptanceRow,
  type PlatformTenantLegalAcceptanceRowDto,
} from '#modules/consent/platform/dto/platform_legal_acceptance.dto'
import type {
  PlatformConsentRepository,
  PlatformTenantRef,
} from '#modules/consent/platform/platform_consent.repository'
import type { EvidenceRowDto, EvidencePageDto } from '#modules/consent/evidence/dto/evidence.dto'
import type EvidenceService from '#modules/consent/evidence/evidence.service'
import type PlatformTenantService from '#services/platform_tenant_service'

/** Orden cerrado de las 9 llaves del contrato por lista blanca (D2 lo hereda). */
const CONTRACT_KEYS = [
  'userConsentId',
  'userName',
  'isOwner',
  'documentType',
  'version',
  'acceptedAt',
  'channel',
  'ip',
  'userAgent',
] as const

/** Doble de `EvidenceService`: registra cada `getEvidence` y devuelve una página fija. */
interface EvidenceSpy {
  service: EvidenceService
  calls: Array<{
    filters: unknown
    pagination: unknown
    revealAllowed: boolean
  }>
}

function makeEvidenceSpy(page: EvidencePageDto): EvidenceSpy {
  const calls: EvidenceSpy['calls'] = []
  const service = {
    async getEvidence(filters: unknown, pagination: unknown, revealAllowed: boolean) {
      calls.push({ filters, pagination, revealAllowed })
      return page
    },
  } as unknown as EvidenceService
  return { service, calls }
}

/** Doble de `PlatformConsentRepository`: stubs de tenant y owners, sin BD. */
function makeRepository(options: {
  tenant: PlatformTenantRef | null
  ownerUserIds: number[]
}): PlatformConsentRepository {
  return {
    async findBusinessUnitByPublicId(): Promise<PlatformTenantRef | null> {
      return options.tenant
    },
    async findOwnerUserIds(): Promise<number[]> {
      return options.ownerUserIds
    },
    async findCurrentDocuments() {
      throw new Error('no usado por getTenantHistory')
    },
    async listTenantAcceptances() {
      throw new Error('no usado por getTenantHistory')
    },
  }
}

/** Servicio bajo prueba con dobles inyectados (sin BD ni contexto de tenant). */
function makeService(
  repository: PlatformConsentRepository,
  evidence: EvidenceService
): PlatformConsentService {
  const tenantService = {} as unknown as PlatformTenantService
  return new PlatformConsentService(tenantService, repository, evidence)
}

/** Fila de evidencia con `ip`/`userAgent` ya enmascarados por el servicio real. */
function makeEvidenceRow(overrides: Partial<EvidenceRowDto> = {}): EvidenceRowDto {
  return {
    userConsentId: 1,
    userId: 11,
    userName: 'Ana Torres',
    businessUnitPublicIds: ['uuid-a'],
    businessUnitNames: ['Acme'],
    legalDocumentId: 7,
    documentType: 'terms_conditions',
    version: '2.0',
    acceptedAt: '2026-06-01T10:00:00.000-06:00',
    ip: SENSITIVE_MASK,
    userAgent: SENSITIVE_MASK,
    channel: 'digital',
    employeeId: null,
    registeredByName: null,
    signedAt: null,
    hasAttachment: false,
    ...overrides,
  }
}

const EMPTY_META = { total: 0, perPage: 20, currentPage: 1, lastPage: 1 }

test.group('PlatformConsentService.getTenantHistory', () => {
  test('publicId inexistente → PlatformConsentError empresa-no-encontrada sin consultar evidencia (SEC-D-01)', async ({
    assert,
  }) => {
    const evidence = makeEvidenceSpy({ data: [], meta: EMPTY_META })
    const repository = makeRepository({ tenant: null, ownerUserIds: [] })
    const service = makeService(repository, evidence.service)

    let caught: unknown = null
    try {
      await service.getTenantHistory('uuid-inexistente', 1, 20)
    } catch (error) {
      caught = error
    }

    assert.instanceOf(caught, PlatformConsentError)
    assert.equal((caught as PlatformConsentError).key, 'empresa-no-encontrada')
    assert.lengthOf(evidence.calls, 0, 'el 404 corta antes de tocar user_consents')
  })

  test('feliz → resuelve tenant, pagina y proyecta la lista blanca marcando isOwner', async ({
    assert,
  }) => {
    const evidence = makeEvidenceSpy({
      data: [
        makeEvidenceRow({ userConsentId: 1, userId: 11, userName: 'Ana Torres' }),
        makeEvidenceRow({ userConsentId: 2, userId: 12, userName: 'Beto Ruiz' }),
      ],
      meta: { total: 2, perPage: 50, currentPage: 2, lastPage: 1 },
    })
    const repository = makeRepository({
      tenant: { businessUnitId: 7, businessUnitPublicId: 'uuid-a', businessUnitName: 'Acme' },
      ownerUserIds: [11],
    })
    const service = makeService(repository, evidence.service)

    const result = await service.getTenantHistory('uuid-a', 2, 50)

    assert.deepEqual(evidence.calls[0], {
      filters: {
        businessUnitId: 7,
        types: ['terms_conditions', 'privacy_notice'],
        excludePlatformAccounts: true,
      },
      pagination: { page: 2, perPage: 50 },
      revealAllowed: false,
    })

    assert.equal(result.type, 'success')
    assert.deepEqual(result.tenant, {
      businessUnitPublicId: 'uuid-a',
      businessUnitName: 'Acme',
    })
    assert.deepEqual(result.meta, { total: 2, perPage: 50, currentPage: 2, lastPage: 1 })
    assert.lengthOf(result.data, 2)
    assert.isTrue(result.data[0].isOwner)
    assert.isFalse(result.data[1].isOwner)

    for (const row of result.data) {
      assert.deepEqual(Object.keys(row), [...CONTRACT_KEYS])
    }
  })

  test('businessUnitId inválido → Error interno (no PlatformConsentError) sin consultar evidencia', async ({
    assert,
  }) => {
    const evidence = makeEvidenceSpy({ data: [], meta: EMPTY_META })
    const repository = makeRepository({
      tenant: { businessUnitId: 0, businessUnitPublicId: 'uuid-b', businessUnitName: 'Beta' },
      ownerUserIds: [],
    })
    const service = makeService(repository, evidence.service)

    let caught: unknown = null
    try {
      await service.getTenantHistory('uuid-b', 1, 20)
    } catch (error) {
      caught = error
    }

    assert.notInstanceOf(caught, PlatformConsentError)
    assert.instanceOf(caught, Error)
    assert.lengthOf(evidence.calls, 0)
  })
})

test.group('toTenantLegalAcceptanceRow — lista blanca', () => {
  test('solo las 9 llaves del contrato e isOwner según el set de owners', ({ assert }) => {
    const row = makeEvidenceRow({
      userConsentId: 5,
      userId: 99,
      userName: 'Carla Núñez',
      businessUnitPublicIds: ['uuid-otra'],
      businessUnitNames: ['Otra Empresa'],
      legalDocumentId: 3,
      documentType: 'privacy_notice',
      channel: 'physical',
      employeeId: 7,
      registeredByName: 'RH Anotador',
      signedAt: '2026-01-01',
      hasAttachment: true,
    })

    const withOwner: PlatformTenantLegalAcceptanceRowDto = toTenantLegalAcceptanceRow(
      row,
      new Set([99])
    )
    assert.isTrue(withOwner.isOwner)
    assert.deepEqual(Object.keys(withOwner), [...CONTRACT_KEYS])
    assert.notProperty(withOwner, 'userId')
    assert.notProperty(withOwner, 'employeeId')
    assert.notProperty(withOwner, 'legalDocumentId')
    assert.notProperty(withOwner, 'businessUnitPublicIds')
    assert.notProperty(withOwner, 'registeredByName')

    const withoutOwner = toTenantLegalAcceptanceRow(row, new Set<number>())
    assert.isFalse(withoutOwner.isOwner)
    assert.deepEqual(Object.keys(withoutOwner), [...CONTRACT_KEYS])
  })
})
