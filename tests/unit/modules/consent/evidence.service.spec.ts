import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type UserConsent from '#models/user_consent'
import EvidenceService from '../../../../app/modules/consent/evidence/evidence.service.js'
import type {
  EvidenceFilters,
  EvidencePageResult,
  EvidencePagination,
  EvidenceRepository,
} from '../../../../app/modules/consent/evidence/evidence.repository.js'

/**
 * Tests unitarios de `EvidenceService.toDto` (privado, ejercitado vía `getEvidence`/
 * `getExportRows`) enfocados en H6 (USRH1784146205513, obligatoria): un asiento físico
 * puede tener `userId NULL` (empleado de kiosco sin usuario) — la conversión a DTO
 * NUNCA debe reventar por acceder `row.user.businessUnits`/`row.user.person` sin guarda.
 *
 * Fakea `EvidenceRepository` (mismo patrón que `acceptance.service.spec.ts`): sin BD,
 * las filas son objetos planos casteados a `UserConsent` con exactamente las relaciones
 * que el repositorio real precarga (`user`, `employee`, `registeredBy`, `legalDocument`).
 */

function makeRepo(rows: UserConsent[]): EvidenceRepository {
  return {
    async findEvidence(_filters: EvidenceFilters, pagination: EvidencePagination): Promise<EvidencePageResult> {
      return {
        rows,
        meta: { total: rows.length, perPage: pagination.perPage, currentPage: pagination.page, lastPage: 1 },
      }
    },
    async findAllForExport(): Promise<UserConsent[]> {
      return rows
    },
  }
}

const LEGAL_DOC = {
  legalDocumentType: 'biometric_consent',
  legalDocumentVersion: '2.0',
}

function makeDigitalRow(overrides: Record<string, unknown> = {}): UserConsent {
  return {
    userConsentId: 1,
    userId: 10,
    employeeId: null,
    legalDocumentId: 7,
    legalDocument: LEGAL_DOC,
    userConsentDocumentVersion: '2.0',
    userConsentAcceptedAt: DateTime.fromISO('2026-06-01T10:00:00'),
    userConsentIp: null,
    userConsentUserAgent: null,
    userConsentChannel: 'digital',
    userConsentSignedAt: null,
    userConsentEvidenceFile: null,
    registeredBy: null,
    employee: null,
    user: {
      person: { personFirstname: 'Ana', personLastname: 'Torres', personSecondLastname: '' },
      businessUnits: [{ businessUnitPublicId: 'bu-uuid-1', businessUnitName: 'Empresa Demo' }],
    },
    ...overrides,
  } as unknown as UserConsent
}

function makePhysicalRowWithoutUser(overrides: Record<string, unknown> = {}): UserConsent {
  return {
    userConsentId: 2,
    userId: null,
    employeeId: 46,
    legalDocumentId: 7,
    legalDocument: LEGAL_DOC,
    userConsentDocumentVersion: '2.0',
    userConsentAcceptedAt: DateTime.fromISO('2026-07-15T13:00:00'),
    userConsentIp: '203.0.113.10',
    userConsentUserAgent: 'kiosk-agent/1.0',
    userConsentChannel: 'physical',
    userConsentSignedAt: DateTime.fromISO('2026-07-10'),
    userConsentEvidenceFile: 'consent-evidences/46/file.pdf',
    user: null,
    employee: {
      person: { personFirstname: 'Kiosco', personLastname: 'Empleado', personSecondLastname: '' },
      businessUnit: { businessUnitPublicId: 'bu-uuid-2', businessUnitName: 'Planta Norte' },
    },
    registeredBy: {
      person: { personFirstname: 'Wilvardo', personLastname: 'Cruz', personSecondLastname: '' },
    },
    ...overrides,
  } as unknown as UserConsent
}

test.group('EvidenceService.getEvidence — H6: tolerancia a userId NULL (asiento físico sin usuario)', () => {
  test('fila digital con user: nombre y empresa desde user.person/user.businessUnits (comportamiento previo intacto)', async ({
    assert,
  }) => {
    const service = new EvidenceService(makeRepo([makeDigitalRow()]))

    const page = await service.getEvidence({}, { page: 1, perPage: 20 }, false)

    assert.lengthOf(page.data, 1)
    const row = page.data[0]
    assert.equal(row.userId, 10)
    assert.equal(row.userName, 'Ana Torres')
    assert.deepEqual(row.businessUnitPublicIds, ['bu-uuid-1'])
    assert.deepEqual(row.businessUnitNames, ['Empresa Demo'])
    assert.equal(row.channel, 'digital')
    assert.isNull(row.employeeId)
    assert.isNull(row.registeredByName, 'canal digital nunca expone registeredByName')
    assert.isNull(row.signedAt)
    assert.isFalse(row.hasAttachment)
  })

  test('fila física SIN usuario: NO revienta, resuelve nombre/empresa desde employee.person/employee.businessUnit', async ({
    assert,
  }) => {
    const service = new EvidenceService(makeRepo([makePhysicalRowWithoutUser()]))

    const page = await service.getEvidence({}, { page: 1, perPage: 20 }, false)

    assert.lengthOf(page.data, 1)
    const row = page.data[0]
    assert.isNull(row.userId)
    assert.equal(row.userName, 'Kiosco Empleado')
    assert.deepEqual(row.businessUnitPublicIds, ['bu-uuid-2'])
    assert.deepEqual(row.businessUnitNames, ['Planta Norte'])
    assert.equal(row.channel, 'physical')
    assert.equal(row.employeeId, 46)
    assert.equal(row.registeredByName, 'Wilvardo Cruz')
    assert.equal(row.signedAt, '2026-07-10')
    assert.isTrue(row.hasAttachment)
  })

  test('fila física sin usuario Y sin employee precargado (caso límite): no revienta, arrays/nombre vacíos', async ({
    assert,
  }) => {
    const service = new EvidenceService(
      makeRepo([makePhysicalRowWithoutUser({ employee: null, registeredBy: null })])
    )

    const page = await service.getEvidence({}, { page: 1, perPage: 20 }, false)

    const row = page.data[0]
    assert.equal(row.userName, '')
    assert.deepEqual(row.businessUnitPublicIds, [])
    assert.deepEqual(row.businessUnitNames, [])
    assert.isNull(row.registeredByName)
  })

  test('ip/userAgent siguen enmascarados por default también en filas físicas (sin fuga)', async ({
    assert,
  }) => {
    const service = new EvidenceService(makeRepo([makePhysicalRowWithoutUser()]))

    const page = await service.getEvidence({}, { page: 1, perPage: 20 }, false)

    const row = page.data[0]
    assert.notEqual(row.ip, '203.0.113.10')
    assert.notEqual(row.userAgent, 'kiosk-agent/1.0')
  })

  test('getExportRows también tolera userId NULL (mismo toDto, sin paginar)', async ({ assert }) => {
    const service = new EvidenceService(makeRepo([makeDigitalRow(), makePhysicalRowWithoutUser()]))

    const rows = await service.getExportRows({}, false)

    assert.lengthOf(rows, 2)
    assert.sameMembers(rows.map((r) => r.channel), ['digital', 'physical'])
  })
})
