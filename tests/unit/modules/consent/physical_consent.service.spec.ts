import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import ConsentError from '#exceptions/consent_error'
import type UserConsent from '#models/user_consent'
import type Employee from '#models/employee'
import type PiiAccessLogService from '#services/pii_access_log_service'
import type LegalDocument from '#models/legal_document'
import type { LegalDocumentType } from '#models/legal_document'
import PhysicalConsentService from '../../../../app/modules/consent/physical/physical_consent.service.js'
import type {
  PhysicalConsentFileStorage,
  RegisterPhysicalConsentInput,
} from '../../../../app/modules/consent/physical/physical_consent.service.js'
import type {
  InsertPhysicalConsentInput,
  PhysicalConsentRepository,
} from '../../../../app/modules/consent/physical/physical_consent.repository.js'
import type { PhysicalConsentEmployeeScope } from '../../../../app/modules/consent/physical/physical_consent_employee_scope.js'
import type { LegalDocumentRepository } from '../../../../app/modules/legal-documents/legal_document.repository.js'

// ---------------------------------------------------------------------------
// Fakes en memoria (mismo patrón que tests/unit/modules/consent/acceptance.service.spec.ts):
// mockear las interfaces que consume el service, sin BD ni S3 real. El employee
// scope se inyecta aparte (`PhysicalConsentEmployeeScope`) precisamente para que
// este archivo pueda probar `PhysicalConsentService` como unidad aislada.
// ---------------------------------------------------------------------------

type FakeLegalDocRow = {
  legalDocumentId: number
  legalDocumentType: LegalDocumentType
  legalDocumentVersion: string
}

function makeLegalDocumentRepo(seed: FakeLegalDocRow[]) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const repo: LegalDocumentRepository = {
    async findCurrentByType(type) {
      calls.push({ method: 'findCurrentByType', args: [type] })
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
    async findById() {
      throw new Error('no usado en estos tests')
    },
    async findByIdForUpdate() {
      throw new Error('no usado en estos tests')
    },
    async listByType() {
      throw new Error('no usado en estos tests')
    },
    async createDraft() {
      throw new Error('no usado en estos tests')
    },
    async updateDraft() {
      throw new Error('no usado en estos tests')
    },
    async markAsPublished() {
      throw new Error('no usado en estos tests')
    },
  }
  return { repo, calls }
}

interface FakeEmployee {
  employeeId: number
  businessUnitId: number
  person?: { user?: { userId: number } | null } | null
}

function makeEmployeeScope(employee: FakeEmployee | null) {
  const calls: Array<{ employeeId: number; allowedBusinessUnitIds: number[] }> = []
  const scope: PhysicalConsentEmployeeScope = {
    async findInScope(employeeId, allowedBusinessUnitIds) {
      calls.push({ employeeId, allowedBusinessUnitIds })
      return employee as unknown as Employee | null
    },
  }
  return { scope, calls }
}

interface FakeConsentRow {
  userConsentId: number
  employeeId: number
  userId: number | null
  legalDocumentId: number
  userConsentDocumentVersion: string
  userConsentChannel: 'digital' | 'physical'
  userConsentRegisteredByUserId: number | null
  userConsentSignedAt: DateTime | null
  userConsentAcceptedAt: DateTime
  userConsentEvidenceFile: string | null
  userConsentEvidenceOriginalName: string | null
  employee?: { businessUnitId: number } | null
  registeredBy?: {
    person?: { personFirstname: string; personLastname: string; personSecondLastname: string }
  } | null
}

function makePhysicalConsentRepo(
  options: {
    seed?: FakeConsentRow[]
    insertThrows?: unknown
  } = {}
) {
  const rows: FakeConsentRow[] = [...(options.seed ?? [])]
  const calls: Array<{ method: string; args: unknown[] }> = []
  let nextId = 1000

  const repo: PhysicalConsentRepository = {
    async findForEmployeeAndDocument(employeeId, userId, legalDocumentId) {
      calls.push({ method: 'findForEmployeeAndDocument', args: [employeeId, userId, legalDocumentId] })
      const found = rows.find(
        (r) =>
          r.legalDocumentId === legalDocumentId &&
          (r.employeeId === employeeId || (userId !== null && r.userId === userId))
      )
      return (found ?? null) as unknown as UserConsent | null
    },
    async insertPhysicalConsent(input: InsertPhysicalConsentInput) {
      calls.push({ method: 'insertPhysicalConsent', args: [input] })
      if (options.insertThrows) {
        throw options.insertThrows
      }
      const row: FakeConsentRow = {
        userConsentId: nextId++,
        employeeId: input.employeeId,
        userId: input.userId,
        legalDocumentId: input.legalDocumentId,
        userConsentDocumentVersion: input.documentVersion,
        userConsentChannel: 'physical',
        userConsentRegisteredByUserId: input.registeredByUserId,
        userConsentSignedAt: input.signedAt,
        userConsentAcceptedAt: input.acceptedAt,
        userConsentEvidenceFile: input.evidenceFile,
        userConsentEvidenceOriginalName: input.evidenceOriginalName,
        registeredBy: {
          person: { personFirstname: 'RH', personLastname: 'Operador', personSecondLastname: '' },
        },
      }
      rows.push(row)
      return row as unknown as UserConsent
    },
    async findPhysicalConsentForEmployee(userConsentId, employeeId) {
      calls.push({ method: 'findPhysicalConsentForEmployee', args: [userConsentId, employeeId] })
      const found = rows.find(
        (r) =>
          r.userConsentId === userConsentId &&
          r.employeeId === employeeId &&
          r.userConsentChannel === 'physical'
      )
      return (found ?? null) as unknown as UserConsent | null
    },
    async findPhysicalConsentById(userConsentId) {
      calls.push({ method: 'findPhysicalConsentById', args: [userConsentId] })
      const found = rows.find((r) => r.userConsentId === userConsentId && r.userConsentChannel === 'physical')
      return (found ?? null) as unknown as UserConsent | null
    },
  }

  return { repo, rows, calls }
}

function makeFileStorage(
  options: { uploadResult?: string | null; downloadResult?: unknown } = {}
) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const storage: PhysicalConsentFileStorage = {
    async fileUpload(file, folderName, fileName, permission) {
      calls.push({ method: 'fileUpload', args: [file, folderName, fileName, permission] })
      if (options.uploadResult === null) return 'file_not_found'
      return options.uploadResult ?? 'consent-evidences/45/abc123-consentimiento-firmado.pdf'
    },
    async getDownloadLink(filePath, expireSeconds) {
      calls.push({ method: 'getDownloadLink', args: [filePath, expireSeconds] })
      return options.downloadResult ?? 'https://signed-url.example.com/consentimiento-firmado.pdf'
    },
  }
  return { storage, calls }
}

function makePiiAccessLogService() {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const fake = {
    async record(input: unknown) {
      calls.push({ method: 'record', args: [input] })
      return {}
    },
  }
  return { service: fake as unknown as PiiAccessLogService, calls }
}

function makeFile(
  opts: { extname?: string; type?: string; subtype?: string; size?: number; clientName?: string } = {}
): MultipartFile {
  return {
    extname: opts.extname ?? 'pdf',
    type: opts.type ?? 'application',
    subtype: opts.subtype ?? 'pdf',
    size: opts.size ?? 1024,
    clientName: opts.clientName ?? 'consentimiento-firmado.pdf',
  } as unknown as MultipartFile
}

async function catchAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return err
  }
}

const BIOMETRIC_DOC: FakeLegalDocRow = {
  legalDocumentId: 7,
  legalDocumentType: 'biometric_consent',
  legalDocumentVersion: '2.0',
}

const EMPLOYEE_WITH_USER: FakeEmployee = {
  employeeId: 45,
  businessUnitId: 10,
  person: { user: { userId: 300 } },
}

const EMPLOYEE_WITHOUT_USER: FakeEmployee = {
  employeeId: 46,
  businessUnitId: 10,
  person: { user: null },
}

function makeRegisterInput(overrides: Partial<RegisterPhysicalConsentInput> = {}): RegisterPhysicalConsentInput {
  return {
    employeeId: EMPLOYEE_WITH_USER.employeeId,
    allowedBusinessUnitIds: [10],
    documentVersion: '2.0',
    signedAt: null,
    file: makeFile(),
    registeredByUserId: 3,
    ip: '203.0.113.10',
    userAgent: 'test-agent/1.0',
    ...overrides,
  }
}

function makeService(opts: {
  employee?: FakeEmployee | null
  legalDocs?: FakeLegalDocRow[]
  seedConsents?: FakeConsentRow[]
  insertThrows?: unknown
  uploadResult?: string | null
  downloadResult?: unknown
}) {
  const legalDocs = makeLegalDocumentRepo(opts.legalDocs ?? [BIOMETRIC_DOC])
  const consentRepo = makePhysicalConsentRepo({ seed: opts.seedConsents, insertThrows: opts.insertThrows })
  // `??` trataría `null` (empleado fuera de scope, intencional) igual que `undefined`
  // (parámetro omitido) y ocultaría ese caso de prueba — se distinguen explícitamente.
  const employeeScope = makeEmployeeScope(opts.employee === undefined ? EMPLOYEE_WITH_USER : opts.employee)
  const fileStorage = makeFileStorage({ uploadResult: opts.uploadResult, downloadResult: opts.downloadResult })
  const piiLog = makePiiAccessLogService()

  const service = new PhysicalConsentService(
    consentRepo.repo,
    legalDocs.repo,
    piiLog.service,
    fileStorage.storage,
    employeeScope.scope
  )

  return { service, legalDocs, consentRepo, employeeScope, fileStorage, piiLog }
}

// ---------------------------------------------------------------------------
// register — orden del flujo, doble ancla y mapeo de errores
// ---------------------------------------------------------------------------
test.group('PhysicalConsentService.register', () => {
  test('happy path con usuario: doble ancla (employeeId + userId) y channel physical en el DTO', async ({
    assert,
  }) => {
    const { service, consentRepo } = makeService({ employee: EMPLOYEE_WITH_USER })

    const dto = await service.register(makeRegisterInput())

    assert.equal(dto.employeeId, EMPLOYEE_WITH_USER.employeeId)
    assert.equal(dto.userId, EMPLOYEE_WITH_USER.person!.user!.userId)
    assert.equal(dto.channel, 'physical')
    assert.equal(dto.version, BIOMETRIC_DOC.legalDocumentVersion)
    assert.equal(dto.evidence.originalName, 'consentimiento-firmado.pdf')

    const insertCall = consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent')
    assert.exists(insertCall)
    const insertInput = insertCall!.args[0] as InsertPhysicalConsentInput
    assert.equal(insertInput.employeeId, EMPLOYEE_WITH_USER.employeeId)
    assert.equal(insertInput.userId, EMPLOYEE_WITH_USER.person!.user!.userId)
  })

  test('happy path sin usuario: userId null en el INSERT y en el DTO (empleado de kiosco)', async ({
    assert,
  }) => {
    const { service, consentRepo } = makeService({ employee: EMPLOYEE_WITHOUT_USER })

    const dto = await service.register(
      makeRegisterInput({ employeeId: EMPLOYEE_WITHOUT_USER.employeeId })
    )

    assert.isNull(dto.userId)
    assert.equal(dto.employeeId, EMPLOYEE_WITHOUT_USER.employeeId)

    const insertInput = consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent')!
      .args[0] as InsertPhysicalConsentInput
    assert.isNull(insertInput.userId)
    assert.equal(insertInput.employeeId, EMPLOYEE_WITHOUT_USER.employeeId)
  })

  test('orden: empleado fuera de scope nunca consulta el documento vigente (404, sin fugas)', async ({
    assert,
  }) => {
    const { service, legalDocs } = makeService({ employee: null })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'empleado-no-encontrado')
    assert.equal((thrown as ConsentError).code, 'CSNT.NF.001')
    assert.lengthOf(legalDocs.calls, 0, 'no debe consultar legal_documents si el empleado no está en scope')
  })

  test('sin versión vigente del biométrico: 422 CSNT.VAL.003, nunca sube archivo ni inserta', async ({
    assert,
  }) => {
    const { service, consentRepo, fileStorage } = makeService({ employee: EMPLOYEE_WITH_USER, legalDocs: [] })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'sin-version-vigente-biometrico')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.003')
    assert.lengthOf(fileStorage.calls, 0)
    assert.isUndefined(consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent'))
  })

  test('versión enviada no coincide con la vigente: 422 CSNT.VAL.001', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() =>
      service.register(makeRegisterInput({ documentVersion: '1.0' }))
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'version-de-consentimiento-invalida')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.001')
  })

  test('duplicado detectado en el pre-check: 409 CSNT.DUP.001, nunca sube a S3 ni inserta', async ({
    assert,
  }) => {
    const existing: FakeConsentRow = {
      userConsentId: 1,
      employeeId: EMPLOYEE_WITH_USER.employeeId,
      userId: EMPLOYEE_WITH_USER.person!.user!.userId,
      legalDocumentId: BIOMETRIC_DOC.legalDocumentId,
      userConsentDocumentVersion: '2.0',
      userConsentChannel: 'physical',
      userConsentRegisteredByUserId: 3,
      userConsentSignedAt: DateTime.now(),
      userConsentAcceptedAt: DateTime.now(),
      userConsentEvidenceFile: 'consent-evidences/45/old.pdf',
      userConsentEvidenceOriginalName: 'old.pdf',
    }
    const { service, fileStorage, consentRepo } = makeService({
      employee: EMPLOYEE_WITH_USER,
      seedConsents: [existing],
    })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'consentimiento-ya-registrado')
    assert.equal((thrown as ConsentError).code, 'CSNT.DUP.001')
    assert.lengthOf(fileStorage.calls, 0, 'nunca debe pagar S3 con un duplicado ya detectado')
    assert.isUndefined(consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent'))
  })

  test('archivo ausente: 422 CSNT.VAL.004, nunca sube a S3', async ({ assert }) => {
    const { service, fileStorage } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() => service.register(makeRegisterInput({ file: null })))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'archivo-de-evidencia-requerido')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.004')
    assert.lengthOf(fileStorage.calls, 0)
  })

  test('archivo con extensión no permitida: 422 CSNT.VAL.005', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() =>
      service.register(makeRegisterInput({ file: makeFile({ extname: 'exe', type: 'application', subtype: 'octet-stream' }) }))
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'archivo-de-evidencia-invalido')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.005')
  })

  test('archivo cuyo MIME no corresponde a la extensión declarada: 422 CSNT.VAL.005', async ({
    assert,
  }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    // Extensión .pdf pero contenido reportado como imagen: la whitelist exige AMBAS.
    const thrown = await catchAsync(() =>
      service.register(
        makeRegisterInput({ file: makeFile({ extname: 'pdf', type: 'image', subtype: 'gif' }) })
      )
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'archivo-de-evidencia-invalido')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.005')
  })

  test('archivo demasiado grande (> 10 MB): 422 CSNT.VAL.006', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() =>
      service.register(makeRegisterInput({ file: makeFile({ size: 10 * 1024 * 1024 + 1 }) }))
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'archivo-de-evidencia-demasiado-grande')
    assert.equal((thrown as ConsentError).code, 'CSNT.VAL.006')
  })

  test('fallo de almacenamiento al subir a S3: 500 CSNT.SRV.001, nunca inserta', async ({ assert }) => {
    const { service, consentRepo } = makeService({ employee: EMPLOYEE_WITH_USER, uploadResult: null })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'error-de-almacenamiento-de-evidencia')
    assert.equal((thrown as ConsentError).code, 'CSNT.SRV.001')
    assert.isUndefined(consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent'))
  })

  test('carrera residual: el INSERT falla con ER_DUP_ENTRY pese a pasar el pre-check → 409 CSNT.DUP.001', async ({
    assert,
  }) => {
    const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' })
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER, insertThrows: dupError })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'consentimiento-ya-registrado')
    assert.equal((thrown as ConsentError).code, 'CSNT.DUP.001')
  })

  test('un error de INSERT que NO es duplicado se propaga tal cual (no se enmascara como 409)', async ({
    assert,
  }) => {
    const otherError = new Error('conexión perdida')
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER, insertThrows: otherError })

    const thrown = await catchAsync(() => service.register(makeRegisterInput()))

    assert.notInstanceOf(thrown, ConsentError)
    assert.equal((thrown as Error).message, 'conexión perdida')
  })

  test('signedAt ausente: usa la fecha del asiento (hoy) como fecha de firma', async ({ assert }) => {
    const { service, consentRepo } = makeService({ employee: EMPLOYEE_WITH_USER })

    await service.register(makeRegisterInput({ signedAt: null }))

    const insertInput = consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent')!
      .args[0] as InsertPhysicalConsentInput
    assert.equal(insertInput.signedAt.toISODate(), DateTime.now().toISODate())
  })

  test('signedAt provisto: se respeta la fecha enviada, sin sustituirla por hoy', async ({ assert }) => {
    const { service, consentRepo } = makeService({ employee: EMPLOYEE_WITH_USER })
    const signedAt = new Date('2026-07-10T00:00:00.000Z')

    await service.register(makeRegisterInput({ signedAt }))

    const insertInput = consentRepo.calls.find((c) => c.method === 'insertPhysicalConsent')!
      .args[0] as InsertPhysicalConsentInput
    assert.equal(insertInput.signedAt.toISODate(), '2026-07-10')
  })
})

// ---------------------------------------------------------------------------
// getStatus — para el chip de la ficha del empleado
// ---------------------------------------------------------------------------
test.group('PhysicalConsentService.getStatus', () => {
  test('sin versión vigente publicada: devuelve null (no error)', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER, legalDocs: [] })

    const status = await service.getStatus(EMPLOYEE_WITH_USER.employeeId, [10])

    assert.isNull(status)
  })

  test('sin asiento del documento vigente: devuelve null', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    const status = await service.getStatus(EMPLOYEE_WITH_USER.employeeId, [10])

    assert.isNull(status)
  })

  test('con asiento físico: devuelve version/channel/registeredByName/hasAttachment', async ({
    assert,
  }) => {
    const existing: FakeConsentRow = {
      userConsentId: 55,
      employeeId: EMPLOYEE_WITH_USER.employeeId,
      userId: EMPLOYEE_WITH_USER.person!.user!.userId,
      legalDocumentId: BIOMETRIC_DOC.legalDocumentId,
      userConsentDocumentVersion: '2.0',
      userConsentChannel: 'physical',
      userConsentRegisteredByUserId: 3,
      userConsentSignedAt: DateTime.fromISO('2026-07-10'),
      userConsentAcceptedAt: DateTime.fromISO('2026-07-15T13:00:00'),
      userConsentEvidenceFile: 'consent-evidences/45/file.pdf',
      userConsentEvidenceOriginalName: 'file.pdf',
      registeredBy: {
        person: { personFirstname: 'Wilvardo', personLastname: 'Cruz', personSecondLastname: '' },
      },
    }
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER, seedConsents: [existing] })

    const status = await service.getStatus(EMPLOYEE_WITH_USER.employeeId, [10])

    assert.isNotNull(status)
    assert.equal(status!.userConsentId, 55)
    assert.equal(status!.version, '2.0')
    assert.equal(status!.channel, 'physical')
    assert.equal(status!.signedAt, '2026-07-10')
    assert.equal(status!.registeredByName, 'Wilvardo Cruz')
    assert.isTrue(status!.hasAttachment)
  })

  test('empleado fuera de scope: 404 CSNT.NF.001', async ({ assert }) => {
    const { service } = makeService({ employee: null })

    const thrown = await catchAsync(() => service.getStatus(999, [10]))

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'empleado-no-encontrado')
  })
})

// ---------------------------------------------------------------------------
// getDownloadUrl — bitácora PII ANTES de firmar (S9, fail-closed)
// ---------------------------------------------------------------------------
test.group('PhysicalConsentService.getDownloadUrl', () => {
  const EXISTING_PHYSICAL: FakeConsentRow = {
    userConsentId: 77,
    employeeId: EMPLOYEE_WITH_USER.employeeId,
    userId: EMPLOYEE_WITH_USER.person!.user!.userId,
    legalDocumentId: BIOMETRIC_DOC.legalDocumentId,
    userConsentDocumentVersion: '2.0',
    userConsentChannel: 'physical',
    userConsentRegisteredByUserId: 3,
    userConsentSignedAt: DateTime.now(),
    userConsentAcceptedAt: DateTime.now(),
    userConsentEvidenceFile: 'consent-evidences/45/file.pdf',
    userConsentEvidenceOriginalName: 'file.pdf',
  }

  test('asiento inexistente para ese empleado: 404 CSNT.NF.001, no registra en la bitácora PII', async ({
    assert,
  }) => {
    const { service, piiLog } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() =>
      service.getDownloadUrl(EMPLOYEE_WITH_USER.employeeId, 999, [10], {
        accessorUserId: 3,
        accessorIp: '203.0.113.10',
        accessorUserAgent: null,
        requestId: null,
      })
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'empleado-no-encontrado')
    assert.lengthOf(piiLog.calls, 0)
  })

  test('happy path: registra la bitácora PII ANTES de firmar la URL y devuelve 300s de vigencia', async ({
    assert,
  }) => {
    const { service, piiLog, fileStorage } = makeService({
      employee: EMPLOYEE_WITH_USER,
      seedConsents: [EXISTING_PHYSICAL],
    })

    const result = await service.getDownloadUrl(EMPLOYEE_WITH_USER.employeeId, 77, [10], {
      accessorUserId: 9,
      accessorIp: '203.0.113.20',
      accessorUserAgent: 'agent/1.0',
      requestId: 'req-1',
    })

    assert.equal(result.expiresInSeconds, 300)
    assert.equal(result.downloadUrl, 'https://signed-url.example.com/consentimiento-firmado.pdf')

    assert.lengthOf(piiLog.calls, 1)
    assert.lengthOf(fileStorage.calls, 1)
    assert.equal(piiLog.calls[0].method, 'record')
    assert.equal(fileStorage.calls[0].method, 'getDownloadLink')

    const piiInput = piiLog.calls[0].args[0] as { businessUnitId: number; recordId: number }
    assert.equal(piiInput.businessUnitId, EMPLOYEE_WITH_USER.businessUnitId)
    assert.equal(piiInput.recordId, 77)
  })

  test('fallo al firmar la URL: 500 CSNT.SRV.001 (la bitácora ya quedó registrada, fail-closed)', async ({
    assert,
  }) => {
    const { service, piiLog } = makeService({
      employee: EMPLOYEE_WITH_USER,
      seedConsents: [EXISTING_PHYSICAL],
      downloadResult: { status: 500, data: null, message: 'get_url_failed' },
    })

    const thrown = await catchAsync(() =>
      service.getDownloadUrl(EMPLOYEE_WITH_USER.employeeId, 77, [10], {
        accessorUserId: 9,
        accessorIp: '203.0.113.20',
        accessorUserAgent: null,
        requestId: null,
      })
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'error-de-almacenamiento-de-evidencia')
    assert.lengthOf(piiLog.calls, 1, 'el log ya se escribió antes del intento fallido de firma')
  })
})

// ---------------------------------------------------------------------------
// getDownloadUrlForEvidence — vista GLOBAL de evidencia (sin employeeId de ruta)
// ---------------------------------------------------------------------------
test.group('PhysicalConsentService.getDownloadUrlForEvidence', () => {
  test('asiento inexistente o sin adjunto: 404 CSNT.NF.001', async ({ assert }) => {
    const { service } = makeService({ employee: EMPLOYEE_WITH_USER })

    const thrown = await catchAsync(() =>
      service.getDownloadUrlForEvidence(999, {
        accessorUserId: 1,
        accessorIp: '203.0.113.30',
        accessorUserAgent: null,
        requestId: null,
      })
    )

    assert.instanceOf(thrown, ConsentError)
    assert.equal((thrown as ConsentError).key, 'empleado-no-encontrado')
  })

  test('happy path: firma la URL y registra la bitácora con el businessUnitId del empleado anclado', async ({
    assert,
  }) => {
    const existing: FakeConsentRow = {
      userConsentId: 88,
      employeeId: EMPLOYEE_WITHOUT_USER.employeeId,
      userId: null,
      legalDocumentId: BIOMETRIC_DOC.legalDocumentId,
      userConsentDocumentVersion: '2.0',
      userConsentChannel: 'physical',
      userConsentRegisteredByUserId: 3,
      userConsentSignedAt: DateTime.now(),
      userConsentAcceptedAt: DateTime.now(),
      userConsentEvidenceFile: 'consent-evidences/46/file.pdf',
      userConsentEvidenceOriginalName: 'file.pdf',
      employee: { businessUnitId: EMPLOYEE_WITHOUT_USER.businessUnitId },
    }
    const { service, piiLog } = makeService({ seedConsents: [existing] })

    const result = await service.getDownloadUrlForEvidence(88, {
      accessorUserId: 1,
      accessorIp: '203.0.113.30',
      accessorUserAgent: null,
      requestId: null,
    })

    assert.exists(result.downloadUrl)
    assert.equal(piiLog.calls[0].args[0] && (piiLog.calls[0].args[0] as { businessUnitId: number }).businessUnitId, 10)
  })
})
