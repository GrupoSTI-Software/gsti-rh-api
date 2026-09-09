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

const NOW = DateTime.fromISO('2026-08-13T17:05:30Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'NYU7253300829',
  ip: '192.168.1.99',
  timezone: null,
  receivedAt: NOW,
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

function makeService(
  resolution: PinResolution = EMPLOYEE,
  options: { storeFails?: string } = {}
) {
  const stored: StoreTemplateInput[] = []
  const heldBio: HeldBiometricInput[] = []
  const unmapped: string[] = []
  const incidents: IncidentInput[] = []

  const templates = {
    async store(input: StoreTemplateInput) {
      if (options.storeFails) return { ok: false as const, reason: options.storeFails }
      stored.push(input)
      return { ok: true as const, templateId: stored.length, created: true }
    },
  } as unknown as TemplateService

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

  const incidentService = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      incidents.push(input)
      return 'created'
    },
  } as unknown as IncidentService

  const service = new BiometricUploadService(
    templates,
    pins,
    heldBiometrics,
    heldPunches,
    incidentService
  )
  return { service, stored, heldBio, unmapped, incidents }
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
