import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BiometricUploadService, {
  type BiometricUploadContext,
} from '#modules/adms/uploads/biometric_upload.service'
import type TemplateService from '#modules/biometric-vault/template/template.service'
import type { StoreTemplateInput } from '#modules/biometric-vault/template/template.service'
import type PinResolverService from '#modules/adms/ingestion/pin_resolver.service'
import type { PinResolution } from '#modules/adms/ingestion/pin_resolver.service'
import type {
  HeldBiometricInput,
  HeldBiometricRepository,
} from '#modules/adms/uploads/held_biometric.repository'
import type { HeldPunchRepository } from '#modules/adms/ingestion/held_punch.repository'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import type ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
import type ReplicationService from '#modules/biometric-vault/replication/replication.service'
import type { ReplicationInput } from '#modules/biometric-vault/replication/replication.service'
import type RosterReconciliationService from '#modules/access-point/employee-sync/roster_reconciliation.service'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type AccessPointEmployee from '#models/access_point_employee'

const NOW = DateTime.fromISO('2026-08-13T17:05:30Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'NYU7253300829',
  ip: '192.168.1.99',
  timezone: null,
  receivedAt: NOW,
  configuredAt: null,
  participantBusinessUnitIds: [1],
  shared: false,
}

const FINGER_BLOB = 'A'.repeat(1120)
const FACE_BLOB = 'B'.repeat(1400)

const BIODATA_FINGER = `BIODATA Pin=9995\tNo=7\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB}`

function contextOf(overrides: Partial<BiometricUploadContext> = {}): BiometricUploadContext {
  return {
    device: DEVICE,
    body: `${BIODATA_FINGER}\n`,
    rawMessageId: 88,
    deviceFpVersion: '13',
    deviceFaceVersion: '40',
    ...overrides,
  }
}

const EMPLOYEE: PinResolution = {
  kind: 'employee',
  employeeId: 77,
  employeeCode: 'EMP-77',
  pinInferred: false,
}

interface Options {
  storeFails?: string
  /** Quien pidio la captura; `null` es una huella enrolada a mano en el aparato. */
  requestedByUserId?: number | null
  /** Vinculos vivos del colaborador: de aqui salen los equipos destino. */
  pivots?: Array<{ accessPointId: number; status?: string }>
  /** El blob ya estaba en la boveda: no es un template nuevo. */
  alreadyStored?: boolean
}

function makeService(resolution: PinResolution = EMPLOYEE, options: Options = {}) {
  const stored: StoreTemplateInput[] = []
  const heldBio: HeldBiometricInput[] = []
  const unmapped: string[] = []
  const incidents: IncidentInput[] = []
  const replicated: ReplicationInput[] = []

  const templates = {
    async store(input: StoreTemplateInput) {
      if (options.storeFails) return { ok: false as const, reason: options.storeFails }
      stored.push(input)
      return {
        ok: true as const,
        templateId: stored.length,
        created: options.alreadyStored !== true,
      }
    },
  } as unknown as TemplateService

  const evidence = {
    async fromBiometricUpload() {
      return { closed: 1, requestedByUserId: options.requestedByUserId ?? null }
    },
  } as unknown as ExecutionEvidenceService

  const replication = {
    async replicate(input: ReplicationInput) {
      replicated.push(input)
      return { sourceAccessPointId: input.sourceAccessPointId, targets: [] }
    },
  } as unknown as ReplicationService

  const roster = {
    async reconcile() {
      return { confirmed: 0, revoked: 0, revokeFailed: 0 }
    },
  } as unknown as RosterReconciliationService

  const pivots = {
    async listLiveByEmployee() {
      return (options.pivots ?? []).map(
        (pivot) =>
          ({
            accessPointId: pivot.accessPointId,
            accessPointEmployeeSyncStatus: pivot.status ?? 'confirmed',
          }) as AccessPointEmployee
      )
    },
  } as unknown as EmployeeSyncRepository

  const pins = {
    async resolve() {
      return resolution
    },
  } as unknown as PinResolverService

  const heldBiometrics: HeldBiometricRepository = {
    async hold(input) {
      heldBio.push(input)
    },
  }

  const heldPunches = {
    async hold() {},
    async touchUnmappedPin(input: { pin: string }) {
      unmapped.push(input.pin)
      return 5
    },
  } as unknown as HeldPunchRepository

  const recordOptions: Array<Record<string, unknown>> = []
  const incidentService = {
    async record(input: IncidentInput, opts?: Record<string, unknown>): Promise<IncidentOutcome> {
      incidents.push(input)
      recordOptions.push(opts ?? {})
      return 'created'
    },
  } as unknown as IncidentService

  const service = new BiometricUploadService(
    templates,
    pins,
    heldBiometrics,
    heldPunches,
    incidentService,
    evidence,
    replication,
    roster,
    pivots
  )
  return { service, stored, heldBio, unmapped, incidents, recordOptions, replicated }
}

test.group('Subida de biometricos: BIODATA', () => {
  test('una huella con version explicita entra a la boveda tal cual', async ({ assert }) => {
    const { service, stored } = makeService()
    const result = await service.ingestBiodata(contextOf())

    assert.equal(result.status, 'processed')
    assert.equal(result.stored, 1)
    assert.lengthOf(stored, 1)
    assert.equal(stored[0].employeeId, 77)
    assert.equal(stored[0].bioType, 1)
    assert.equal(stored[0].bioNo, 7)
    assert.equal(stored[0].majorVer, '13')
    assert.equal(stored[0].template, FINGER_BLOB)
    assert.equal(stored[0].sourceAccessPointId, 12)
    assert.equal(stored[0].capturedAt, NOW)
  })

  test('sin version en la linea se usa la del perfil del equipo que subio', async ({ assert }) => {
    const { service, stored } = makeService()
    await service.ingestBiodata(
      contextOf({
        body: `BIODATA Pin=9995\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tFormat=0\tTmp=${FACE_BLOB}\n`,
      })
    )
    // Rostro: toma FaceVersion, no FPVersion.
    assert.equal(stored[0].majorVer, '40')
    assert.equal(stored[0].bioType, 9)
  })

  test('sin version en la linea ni en el perfil el template queda sin version', async ({
    assert,
  }) => {
    const { service, stored } = makeService()
    await service.ingestBiodata(
      contextOf({
        body: `BIODATA Pin=9995\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tFormat=0\tTmp=${FACE_BLOB}\n`,
        deviceFaceVersion: null,
      })
    )
    assert.isNull(stored[0].majorVer)
  })

  test('un PIN sin dueno retiene el biometrico y lo encola para conciliar', async ({ assert }) => {
    const { service, stored, heldBio, unmapped } = makeService({
      kind: 'held',
      reason: 'unknown_pin',
    })
    const result = await service.ingestBiodata(contextOf())

    assert.equal(result.status, 'partial')
    assert.equal(result.held, 1)
    assert.lengthOf(stored, 0)
    assert.lengthOf(heldBio, 1)
    assert.equal(heldBio[0].pin, '9995')
    assert.equal(heldBio[0].bioType, 1)
    assert.equal(heldBio[0].template, FINGER_BLOB)
    assert.equal(heldBio[0].admsUnmappedPinId, 5)
    assert.deepEqual(unmapped, ['9995'])
  })

  test('un blob que no valida no se guarda y deja incidente', async ({ assert }) => {
    const { service, stored, incidents } = makeService(EMPLOYEE, { storeFails: 'too_short' })
    const result = await service.ingestBiodata(contextOf())

    assert.equal(result.invalid, 1)
    assert.lengthOf(stored, 0)
    assert.equal(incidents[0].kind, 'invalid_template')
    assert.equal(incidents[0].context?.reason, 'too_short')
  })

  test('una linea ilegible cuenta pero no tumba el lote', async ({ assert }) => {
    const { service, stored } = makeService()
    const result = await service.ingestBiodata(contextOf({ body: `basura\n${BIODATA_FINGER}\n` }))
    assert.equal(result.unparsed, 1)
    assert.equal(result.stored, 1)
    assert.lengthOf(stored, 1)
  })
})

/**
 * VLRH-H1791825638185, reglas 1 y 2: la huella que entra viaja sola. Antes
 * cada huella nueva volvia a repartir todos los dedos y la foto a cada equipo.
 */
test.group('Subida de biometricos: reparto a los demas equipos', () => {
  test('la huella nueva se reparte sola, al resto de los equipos vivos', async ({ assert }) => {
    const { service, replicated } = makeService(EMPLOYEE, {
      requestedByUserId: 9,
      pivots: [
        { accessPointId: 12 },
        { accessPointId: 33 },
        { accessPointId: 34, status: 'revoked' },
        { accessPointId: 35, status: 'pending' },
      ],
    })
    await service.ingestBiodata(contextOf())

    assert.lengthOf(replicated, 1)
    assert.deepEqual(replicated[0].only, { bioType: 1, bioNo: 7 })
    assert.deepEqual(replicated[0].targetAccessPointIds, [33, 35])
    assert.equal(replicated[0].sourceAccessPointId, 12)
    assert.equal(replicated[0].actor.userId, 9)
    assert.equal(replicated[0].actor.ip, '192.168.1.99')
    assert.isFalse(replicated[0].dryRun)
  })

  /**
   * Una huella enrolada en el teclado del aparato no tiene quien responda por
   * la lectura, asi que no se copia. Pero callarlo dejaba al operador sin saber
   * que esa huella vive en un solo equipo: queda un aviso en el que la capturo.
   */
  test('sin quien responda por la lectura, no se reparte pero se avisa', async ({ assert }) => {
    const { service, replicated, incidents, recordOptions } = makeService(EMPLOYEE, {
      requestedByUserId: null,
      pivots: [{ accessPointId: 33 }],
    })
    await service.ingestBiodata(contextOf())
    assert.lengthOf(replicated, 0)

    assert.lengthOf(incidents, 1)
    assert.equal(incidents[0].kind, 'fingerprint_not_spread')
    // Un aviso por persona y dedo: otra persona en la misma hora no se deduplica.
    assert.deepEqual(recordOptions[0].dedupeBy, ['pin', 'bioNo'])
    assert.equal(incidents[0].severity, 'info')
    assert.equal(incidents[0].key, 'huella-sin-repartir')
    assert.equal(incidents[0].accessPointId, 12)
    assert.equal(incidents[0].context?.pin, '9995')
    assert.equal(incidents[0].context?.bioNo, 7)
  })

  test('sin otro equipo al que repartir, tampoco hay aviso', async ({ assert }) => {
    const { service, incidents } = makeService(EMPLOYEE, {
      requestedByUserId: null,
      pivots: [{ accessPointId: 12 }],
    })
    await service.ingestBiodata(contextOf())
    assert.lengthOf(incidents, 0)
  })

  test('un blob que ya estaba guardado no vuelve a repartirse', async ({ assert }) => {
    const { service, replicated } = makeService(EMPLOYEE, {
      requestedByUserId: 9,
      pivots: [{ accessPointId: 33 }],
      alreadyStored: true,
    })
    await service.ingestBiodata(contextOf())
    assert.lengthOf(replicated, 0)
  })

  test('sin otro equipo donde la persona este dada de alta, no hay reparto', async ({
    assert,
  }) => {
    const { service, replicated } = makeService(EMPLOYEE, {
      requestedByUserId: 9,
      pivots: [{ accessPointId: 12 }],
    })
    await service.ingestBiodata(contextOf())
    assert.lengthOf(replicated, 0)
  })
})

test.group('Subida de biometricos: OPERLOG', () => {
  test('la huella de una linea FP toma la version de huella del equipo', async ({ assert }) => {
    const { service, stored } = makeService()
    const result = await service.ingestOperlog(
      contextOf({ body: `FP PIN=9999\tFID=1\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}\n` })
    )
    assert.equal(result.stored, 1)
    assert.equal(stored[0].bioType, 1)
    assert.equal(stored[0].bioNo, 1)
    assert.equal(stored[0].majorVer, '13')
  })

  test('el PIN con doble igual no le cuelga la huella a nadie', async ({ assert }) => {
    const { service, stored, heldBio } = makeService()
    const result = await service.ingestOperlog(
      contextOf({ body: `FP PIN==1\tFID=0\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}\n` })
    )
    assert.equal(result.unparsed, 1)
    assert.lengthOf(stored, 0)
    assert.lengthOf(heldBio, 0)
  })

  test('la bitacora de operacion se resume, no se guarda linea por linea', async ({ assert }) => {
    const { service, incidents } = makeService()
    await service.ingestOperlog(
      contextOf({
        body: [
          'OPLOG 4\t0\t2026-08-12 08:17:48\t0\t0\t0\t0',
          'OPLOG 13\t0\t2026-08-12 08:13:43\t0\t0\t0\t0',
        ].join('\n'),
      })
    )
    assert.lengthOf(incidents, 1)
    assert.equal(incidents[0].kind, 'oplog')
    assert.equal(incidents[0].context?.lines, 2)
  })

  test('un alta de usuario de un PIN sin dueno alimenta la cola de conciliacion', async ({
    assert,
  }) => {
    const { service, unmapped } = makeService({ kind: 'held', reason: 'unknown_pin' })
    await service.ingestOperlog(
      contextOf({ body: 'USER PIN=9990\tName=ALGUIEN NUEVO\tPri=0\tVerify=-1\n' })
    )
    assert.deepEqual(unmapped, ['9990'])
  })

  test('un alta de usuario de un PIN que si resuelve no crea nada', async ({ assert }) => {
    const { service, unmapped, stored } = makeService()
    await service.ingestOperlog(
      contextOf({ body: 'USER PIN=9998\tName=YA EXISTE\tPri=0\tVerify=-1\n' })
    )
    // El canal nunca crea colaboradores: eso lo decide una persona.
    assert.lengthOf(unmapped, 0)
    assert.lengthOf(stored, 0)
  })
})
