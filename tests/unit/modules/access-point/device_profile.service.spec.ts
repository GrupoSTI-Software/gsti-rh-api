import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import DeviceProfileService from '#modules/access-point/device-profile/device_profile.service'
import type {
  AccessPointDescriptor,
  DeviceProfilePatch,
  DeviceProfileRepository,
} from '#modules/access-point/device-profile/device_profile.repository'
import type AccessPointProfile from '#models/access_point_profile'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import type ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'SYZ8252500376',
  ip: '192.168.1.59',
  timezone: null,
  receivedAt: NOW,
}

const V5L =
  '~DeviceName=SpeedFace-V5L,MAC=00:17:61:13:20:21,UserCount=1,~MaxUserCount=100,FPVersion=10,~MaxFingerCount=60,FPCount=1,FaceVersion=39,~MaxFaceCount=6000,FaceCount=0,IPAddress=192.168.1.59,~Platform=ZAM180_TFT,~OEMVendor=ZKTECO CO., LTD.,FWVersion=ZAM180-NF50VA-Ver3.4.9,PushVersion=Ver 2.0.33S-20220623'

function makeDeps(existing: Partial<AccessPointProfile> = {}) {
  const incidents: IncidentInput[] = []
  const patches: DeviceProfilePatch[] = []
  const descriptors: AccessPointDescriptor[] = []
  const profile = { ...existing } as AccessPointProfile
  const repository: DeviceProfileRepository = {
    async ensure() {
      return profile
    },
    async findByAccessPoint() {
      return profile
    },
    async setDialect(_id, _bu, dialect) {
      return dialect
    },
    async setRegistryCode() {},
    async recordIpSeen() {},
    async applyOptions(_id, _bu, patch) {
      patches.push(patch)
      Object.assign(profile, patch)
      return profile
    },
    async copyDescriptor(_id, descriptor) {
      descriptors.push(descriptor)
    },
  }
  /** Avisos que el servicio cerro por si solo, con su causa ya resuelta. */
  const resolved: string[] = []
  const incidentService = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      incidents.push(input)
      return 'created'
    },
    async resolveResolvedCause(kind: string): Promise<number> {
      resolved.push(kind)
      return 0
    },
  } as unknown as IncidentService
  const evidenceService = {} as unknown as ExecutionEvidenceService

  /** A que equipos se les vacio la cola de huella y cuantas veces. */
  const cancelledFor: number[] = []
  const commandPort = {
    async cancelFingerprintWritesFor(accessPointId: number): Promise<number> {
      cancelledFor.push(accessPointId)
      return 1
    },
  } as unknown as DeviceCommandPort

  const service = new DeviceProfileService(
    repository,
    incidentService,
    evidenceService,
    commandPort
  )
  return { service, incidents, patches, descriptors, cancelledFor, resolved }
}

test.group('ADMS device profile service', () => {
  test('primer options llena el perfil, marca layout conocido y copia el descriptor', async ({
    assert,
  }) => {
    const { service, incidents, patches, descriptors } = makeDeps()
    const result = await service.upsertFromOptions(DEVICE, V5L, 77)
    assert.equal(result.platform, 'ZAM180_TFT')
    assert.isTrue(result.layoutKnown)
    assert.lengthOf(result.changedFields, 0)
    assert.lengthOf(incidents, 0)
    assert.lengthOf(patches, 1)
    assert.equal(patches[0].accessPointProfileFpVersion, '10')
    assert.equal(patches[0].accessPointProfileFaceVersion, '39')
    assert.equal(patches[0].accessPointProfileLayoutKnown, 1)
    assert.equal(patches[0].accessPointProfileMaxFingerCount, 60)
    assert.deepEqual(patches[0].accessPointProfileVersionsSource, {
      fp: 'flat',
      face: 'flat',
    })
    assert.equal(patches[0].accessPointProfileOptionsRaw, V5L)
    assert.deepEqual(descriptors, [
      {
        deviceName: 'SpeedFace-V5L',
        mac: '00:17:61:13:20:21',
        ip: '192.168.1.59',
        firmware: 'ZAM180-NF50VA-Ver3.4.9',
        platform: 'ZAM180_TFT',
      },
    ])
  })

  test('cambio de firmware o de version de algoritmo deja incidente version_changed', async ({
    assert,
  }) => {
    const { service, incidents, patches } = makeDeps({
      accessPointProfileFwVersion: 'ZAM180-NF50VA-Ver3.4.8',
      accessPointProfileFpVersion: '10',
      accessPointProfileFaceVersion: '39',
    })
    const result = await service.upsertFromOptions(DEVICE, V5L, 78)
    assert.deepEqual(result.changedFields, ['fwVersion'])
    assert.lengthOf(incidents, 1)
    assert.equal(incidents[0].kind, 'version_changed')
    assert.equal(incidents[0].rawMessageId, 78)
    assert.deepEqual(incidents[0].context, {
      field: 'fwVersion',
      previous: 'ZAM180-NF50VA-Ver3.4.8',
      current: 'ZAM180-NF50VA-Ver3.4.9',
    })
    assert.equal(patches[0].accessPointProfileFwVersion, 'ZAM180-NF50VA-Ver3.4.9')
  })

  /**
   * Medido con el parque el 2026-09-10: el SenseFace deja elegir la version del
   * algoritmo de huella en su propio menu, y cambiarla borra todo lo que tenia
   * dentro. Lo que quedara en la cola lleva templates de la generacion vieja.
   */
  test('cambiar la version de huella vacia las copias que iban en camino', async ({ assert }) => {
    const { service, incidents, cancelledFor } = makeDeps({
      accessPointProfileFwVersion: 'ZAM180-NF50VA-Ver3.4.9',
      accessPointProfileFpVersion: '13',
      accessPointProfileFaceVersion: '39',
    })

    await service.upsertFromOptions(DEVICE, V5L, 80)

    assert.equal(incidents[0].kind, 'version_changed')
    assert.equal(incidents[0].context?.field, 'fpVersion')
    assert.deepEqual(cancelledFor, [DEVICE.accessPointId])
  })

  /**
   * El rostro NO viaja como template sino como foto, y cada equipo lo fabrica
   * con su propio algoritmo: un cambio de `FaceVersion` no invalida nada de lo
   * que va en la cola.
   */
  test('un cambio de version de rostro no toca la cola de huella', async ({ assert }) => {
    const { service, incidents, cancelledFor } = makeDeps({
      accessPointProfileFwVersion: 'ZAM180-NF50VA-Ver3.4.9',
      accessPointProfileFpVersion: '10',
      accessPointProfileFaceVersion: '40',
    })

    await service.upsertFromOptions(DEVICE, V5L, 81)

    assert.equal(incidents[0].kind, 'version_changed')
    assert.equal(incidents[0].context?.field, 'faceVersion')
    assert.lengthOf(cancelledFor, 0)
  })

  test('plataforma fuera del mapa: layout desconocido e incidente, sin bloquear', async ({
    assert,
  }) => {
    const { service, incidents, patches } = makeDeps()
    const result = await service.upsertFromOptions(
      DEVICE,
      V5L.replace('~Platform=ZAM180_TFT', '~Platform=ZMM220_TFT'),
      79
    )
    assert.isFalse(result.layoutKnown)
    assert.equal(patches[0].accessPointProfileLayoutKnown, 0)
    assert.equal(incidents[0]?.kind, 'unknown_platform')
    assert.equal(incidents[0]?.context?.platform, 'ZMM220_TFT')
  })

  test('MultiBioVersion manda sobre el campo plano y deja version_source_mismatch', async ({
    assert,
  }) => {
    const { service, incidents, patches } = makeDeps()
    const result = await service.upsertFromOptions(
      DEVICE,
      `${V5L},MultiBioVersion=0:12:0:0:0:0:0:0:0:39`,
      80
    )
    assert.equal(result.mismatches, 1)
    assert.equal(patches[0].accessPointProfileFpVersion, '12')
    assert.equal(patches[0].accessPointProfileVersionsSource?.fp, 'multibio')
    assert.equal(incidents[0]?.kind, 'version_source_mismatch')
    assert.deepEqual(incidents[0]?.context, { modality: 'fp', previous: '10', current: '12' })
  })

  test('sin plataforma en el cuerpo no hay incidente de plataforma ni descriptor vacio', async ({
    assert,
  }) => {
    const { service, incidents, descriptors, patches } = makeDeps()
    const result = await service.upsertFromOptions(DEVICE, 'UserCount=3,FPCount=2', 81)
    assert.isNull(result.platform)
    assert.isFalse(result.layoutKnown)
    assert.lengthOf(incidents, 0)
    assert.lengthOf(descriptors, 0)
    assert.equal(patches[0].accessPointProfileUserCount, 3)
    assert.isNull(patches[0].accessPointProfilePlatform)
  })
})
