import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import CommandAckService from '#modules/device-commands/dispatch/command_ack.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type {
  DeviceCommandRepository,
  ExecutedCopyLookup,
} from '#modules/device-commands/device_command.repository'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type DeviceCommand from '#models/device_command'

/**
 * VLRH-H1791825638185, regla 5: la copia de un dedo que ese equipo ya tenia
 * ejecutado se acredita con el acuse. Reescribir un dedo no mueve el contador
 * del aparato, asi que esperar una prueba posterior era esperar algo que no
 * iba a llegar: a los treinta minutos el barrido la daba por fallida con el
 * dato dentro.
 */
const NOW = DateTime.fromISO('2026-10-12T17:00:00Z')

const NO_PROFILE = {
  async findByAccessPoint() {
    return null
  },
} as unknown as DeviceProfileRepository

function copyOf(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    deviceCommandId: 40,
    deviceCommandWireId: 1791825600000,
    accessPointId: 33,
    businessUnitId: 3,
    deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
    deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
    deviceCommandPin: '1',
    deviceCommandBioNo: 6,
    deviceCommandCorrelationKey: 'biodata:1:1:6',
    deviceCommandAttempts: 0,
    deviceCommandMaxAttempts: 3,
    ...overrides,
  } as DeviceCommand
}

/** Perfil con contadores declarados; `null` es un equipo que aun no sube `options`. */
function profileWith(fpCount: number | null): DeviceProfileRepository {
  return {
    async findByAccessPoint() {
      if (fpCount === null) return null
      return {
        accessPointProfileUserCount: 1,
        accessPointProfileFpCount: fpCount,
        accessPointProfileFaceCount: 1,
      }
    },
  } as unknown as DeviceProfileRepository
}

function makeService(
  command: DeviceCommand,
  delivered: boolean,
  profiles: DeviceProfileRepository = NO_PROFILE
) {
  const saved: DeviceCommand[] = []
  const asked: Array<{ accessPointId: number; key: string; exclude?: number }> = []
  const repository = {
    async findByWireId() {
      return command
    },
    async save(target: DeviceCommand) {
      saved.push(target)
    },
  } as unknown as DeviceCommandRepository
  const copies: ExecutedCopyLookup = {
    async hasExecutedByCorrelation(accessPointId, key, exclude) {
      asked.push({ accessPointId, key, exclude })
      return delivered
    },
  }
  const service = new CommandAckService(repository, undefined, profiles, undefined, undefined, copies)
  return { service, saved, asked }
}

const ACK = { accessPointId: 33, body: 'ID=1791825600000&Return=0&CMD=DATA', now: NOW }

test.group('Acuse de una copia de huella', () => {
  test('con una entrega previa ejecutada, el acuse basta', async ({ assert }) => {
    const { service, saved, asked } = makeService(copyOf(), true)
    const outcome = await service.apply(ACK)

    assert.equal(outcome.kind, 'applied')
    assert.equal(saved[0].deviceCommandStatus, 'executed')
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'ack')
    assert.equal(saved[0].deviceCommandExecutedAt, NOW)
    // Se excluye al propio comando: una entrega es "previa" solo si fue otra.
    assert.deepEqual(asked, [{ accessPointId: 33, key: 'biodata:1:1:6', exclude: 40 }])
  })

  test('la primera copia hacia ese equipo sigue esperando su prueba', async ({ assert }) => {
    const { service, saved } = makeService(copyOf(), false)
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.isNull(saved[0].deviceCommandExecutedAt ?? null)
  })

  /**
   * El rostro no entra aqui: su prueba al acusar es la descarga de la foto, y
   * una copia de template de rostro sigue esperando checada o contador.
   */
  test('una copia de rostro no se cierra por este camino', async ({ assert }) => {
    const { service, saved, asked } = makeService(
      copyOf({ deviceCommandBioNo: 9, deviceCommandCorrelationKey: 'biodata:1:9:9' }),
      true
    )
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.lengthOf(asked, 0)
  })

  test('sin llave de correlacion no se pregunta nada', async ({ assert }) => {
    const { service, saved, asked } = makeService(
      copyOf({ deviceCommandCorrelationKey: null }),
      true
    )
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.lengthOf(asked, 0)
  })

  /**
   * Medido el 2026-10-12 con el SpeedFace: subio `options` con el dedo nuevo
   * ya contado DOS SEGUNDOS ANTES de acusar. Con la linea base tomada al
   * despachar, el propio acuse ya trae la prueba: el contador subio.
   */
  test('si el contador ya subio desde el despacho, el acuse cierra con counter_up', async ({
    assert,
  }) => {
    const { service, saved } = makeService(
      copyOf({ deviceCommandCountersSnapshot: { userCount: 1, fpCount: 1, faceCount: 1 } }),
      false,
      profileWith(2)
    )
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'executed')
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'counter_up')
    // La linea base del despacho se conserva: es la que explica el alza.
    assert.deepEqual(saved[0].deviceCommandCountersSnapshot, {
      userCount: 1,
      fpCount: 1,
      faceCount: 1,
    })
  })

  test('si el contador no se movio desde el despacho, el acuse espera su prueba', async ({
    assert,
  }) => {
    const { service, saved } = makeService(
      copyOf({ deviceCommandCountersSnapshot: { userCount: 1, fpCount: 2, faceCount: 1 } }),
      false,
      profileWith(2)
    )
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.deepEqual(saved[0].deviceCommandCountersSnapshot, {
      userCount: 1,
      fpCount: 2,
      faceCount: 1,
    })
  })

  /** Un comando que salio antes de este cambio no trae linea base: se le toma al acusar. */
  test('sin linea base del despacho, el acuse la toma como antes', async ({ assert }) => {
    const { service, saved } = makeService(
      copyOf({ deviceCommandCountersSnapshot: null }),
      false,
      profileWith(2)
    )
    await service.apply(ACK)

    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.deepEqual(saved[0].deviceCommandCountersSnapshot, {
      userCount: 1,
      fpCount: 2,
      faceCount: 1,
    })
  })

  test('un rechazo del equipo sigue siendo un fallo, haya entrega previa o no', async ({
    assert,
  }) => {
    const { service, saved } = makeService(copyOf(), true)
    await service.apply({ ...ACK, body: 'ID=1791825600000&Return=-30&CMD=DATA' })

    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'template_version_mismatch')
  })
})
