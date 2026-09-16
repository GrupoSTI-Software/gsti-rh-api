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
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'SYZ8252500376',
  ip: '192.168.1.59',
  timezone: null,
  receivedAt: NOW,
  configuredAt: null,
}

const V5L =
  '~DeviceName=SpeedFace-V5L,MAC=00:17:61:13:20:21,UserCount=1,~MaxUserCount=100,FPVersion=10,~MaxFingerCount=60,FPCount=1,FaceVersion=39,~MaxFaceCount=6000,FaceCount=0,IPAddress=192.168.1.59,~Platform=ZAM180_TFT,~OEMVendor=ZKTECO CO., LTD.,FWVersion=ZAM180-NF50VA-Ver3.4.9,PushVersion=Ver 2.0.33S-20220623'

function makeDeps(existing: Partial<AccessPointProfile> = {}, confirmedInside = 0) {
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

  /** Cuantos deberian estar dentro del aparato segun el servidor. */
  const pivotRepository = {
    async countConfirmedBefore(): Promise<number> {
      return confirmedInside
    },
  } as unknown as EmployeeSyncRepository

  const service = new DeviceProfileService(
    repository,
    incidentService,
    evidenceService,
    commandPort,
    pivotRepository
  )
  return { service, incidents, patches, descriptors, cancelledFor, resolved }
}

test.group('ADMS device profile service', () => {
  /**
   * El caso real del 2026-09-11: un volcado corto dejo la ficha sin firmware,
   * sin version de rostro y sin conteos. El perfil es "lo ultimo que el equipo
   * declaro de CADA cosa", no "lo que declaro la ultima vez".
   */
  test('un volcado parcial no borra lo que el equipo ya habia declarado', async ({ assert }) => {
    const { service, patches } = makeDeps({
      accessPointProfilePlatform: 'ZAM180_TFT',
      accessPointProfileFwVersion: 'ZAM180-NF50VA-Ver3.4.9',
      accessPointProfilePushVersion: 'Ver 2.0.33S-20220623',
      accessPointProfileFaceVersion: '39',
      accessPointProfilePvVersion: '12',
      accessPointProfileUserCount: 3,
      accessPointProfileFpCount: 4,
    } as Partial<AccessPointProfile>)

    /** Solo tres claves, como el volcado que provoco el borrado. */
    await service.upsertFromOptions(DEVICE, '~Platform=ZAM180_TFT,FPVersion=10,~MaxUserCount=100', 90)

    const patch = patches[0]
    assert.equal(patch.accessPointProfileFwVersion, 'ZAM180-NF50VA-Ver3.4.9')
    assert.equal(patch.accessPointProfilePushVersion, 'Ver 2.0.33S-20220623')
    assert.equal(patch.accessPointProfileFaceVersion, '39')
    assert.equal(patch.accessPointProfilePvVersion, '12')
    assert.equal(patch.accessPointProfileUserCount, 3)
    assert.equal(patch.accessPointProfileFpCount, 4)
    assert.equal(patch.accessPointProfileFpVersion, '10', 'lo que SI viene, si pisa')
  })

  /** Un valor nuevo tiene que poder cambiar el viejo: preservar no es congelar. */
  test('lo que el equipo declara distinto si reemplaza al anterior', async ({ assert }) => {
    const { service, patches } = makeDeps({
      accessPointProfileFwVersion: 'ZAM180-NF50VA-Ver3.4.8',
    } as Partial<AccessPointProfile>)

    await service.upsertFromOptions(DEVICE, V5L, 91)

    assert.equal(patches[0].accessPointProfileFwVersion, 'ZAM180-NF50VA-Ver3.4.9')
  })

  /**
   * Sin plataforma en el mensaje seguimos sabiendo leer sus checadas: la
   * disposicion se recalcula con la plataforma efectiva, no con la ausente.
   */
  test('un mensaje sin plataforma no hace olvidar la disposicion de checadas', async ({
    assert,
  }) => {
    const { service, patches } = makeDeps({
      accessPointProfilePlatform: 'ZAM180_TFT',
      accessPointProfileLayoutKnown: 1,
    } as Partial<AccessPointProfile>)

    const result = await service.upsertFromOptions(DEVICE, 'UserCount=5', 92)

    assert.isTrue(result.layoutKnown)
    assert.equal(patches[0].accessPointProfileLayoutKnown, 1)
    assert.equal(patches[0].accessPointProfilePlatform, 'ZAM180_TFT')
  })

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

  /**
   * `UserCount=1` en el saludo contra tres altas confirmadas: el aparato perdio
   * a dos. Es lo que deja un reset o un cambio de algoritmo de huella, que
   * borra todo lo que el equipo tenia guardado.
   */
  test('el equipo que declara menos gente de la que se le dio de alta queda asentado', async ({
    assert,
  }) => {
    const { service, incidents } = makeDeps({}, 3)

    await service.upsertFromOptions(DEVICE, V5L, 82)

    const aviso = incidents.find((incident) => incident.kind === 'device_roster_shrunk')
    assert.exists(aviso)
    assert.equal(aviso?.severity, 'error')
    assert.equal(aviso?.context?.declared, 1)
    assert.equal(aviso?.context?.expected, 3)
  })

  /**
   * Que el aparato tenga MAS gente de la que sabemos es otra historia --alguien
   * dado de alta a mano en el teclado-- y no deja a nadie fuera.
   */
  test('un equipo con mas gente de la que sabemos no levanta el aviso', async ({ assert }) => {
    const { service, incidents } = makeDeps({}, 1)

    await service.upsertFromOptions(DEVICE, V5L.replace('UserCount=1', 'UserCount=9'), 83)

    assert.notExists(incidents.find((incident) => incident.kind === 'device_roster_shrunk'))
  })

  test('sin nadie dado de alta no hay padron que comparar', async ({ assert }) => {
    const { service, incidents } = makeDeps({}, 0)

    await service.upsertFromOptions(DEVICE, V5L.replace('UserCount=1', 'UserCount=0'), 84)

    assert.notExists(incidents.find((incident) => incident.kind === 'device_roster_shrunk'))
  })

  /**
   * La plataforma y el firmware los declara el propio aparato, asi que quien
   * capture una sesion legitima los replica: esto no es una puerta, es una
   * alarma. Sirve para el aparato reemplazado sin avisar, que deja a una sede
   * con biometricos que ya no sirven.
   */
  test('un aparato que dice ser otro levanta aviso y retiene sus copias', async ({ assert }) => {
    const { service, incidents } = makeDeps({
      accessPointProfilePlatform: 'ZAM70_TFT',
      accessPointProfileOptionsReadAt: NOW.minus({ hours: 2 }),
    })

    await service.upsertFromOptions(DEVICE, V5L, 92)

    const aviso = incidents.find((incident) => incident.kind === 'device_identity_changed')
    assert.exists(aviso)
    assert.equal(aviso?.severity, 'error')
    assert.equal(aviso?.context?.field, 'platform')
    assert.equal(aviso?.context?.previous, 'ZAM70_TFT')
    assert.equal(aviso?.context?.current, 'ZAM180_TFT')
  })

  /**
   * Reclamar un equipo cambia su identidad de forma legitima. Sin esta
   * excepcion, cada alta naceria con un incidente de seguridad abierto y la
   * gente aprenderia a ignorarlos.
   */
  test('la identidad que cambia tras configurar el equipo no levanta nada', async ({ assert }) => {
    const { service, incidents } = makeDeps({
      accessPointProfilePlatform: 'ZAM70_TFT',
      accessPointProfileOptionsReadAt: NOW.minus({ hours: 2 }),
    })

    await service.upsertFromOptions(
      { ...DEVICE, configuredAt: NOW.minus({ minutes: 5 }) },
      V5L,
      93
    )

    assert.notExists(incidents.find((incident) => incident.kind === 'device_identity_changed'))
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
