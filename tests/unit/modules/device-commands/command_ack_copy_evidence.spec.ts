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

function makeService(command: DeviceCommand, delivered: boolean) {
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
  const service = new CommandAckService(
    repository,
    undefined,
    NO_PROFILE,
    undefined,
    undefined,
    copies
  )
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

  test('un rechazo del equipo sigue siendo un fallo, haya entrega previa o no', async ({
    assert,
  }) => {
    const { service, saved } = makeService(copyOf(), true)
    await service.apply({ ...ACK, body: 'ID=1791825600000&Return=-30&CMD=DATA' })

    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'template_version_mismatch')
  })
})
