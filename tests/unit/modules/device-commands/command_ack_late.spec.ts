import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import CommandAckService from '#modules/device-commands/dispatch/command_ack.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { wasDispatchedBefore } from '#modules/device-commands/device_command.state'
import type { DeviceCommandRepository } from '#modules/device-commands/device_command.repository'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type DeviceCommand from '#models/device_command'

/**
 * VLRH-H1791825638812, regla 4. El equipo se apaga con la orden dentro; el
 * barrido la devuelve a la cola a los tres minutos; el equipo vuelve y acusa
 * antes de que el despacho la reenvie. Ese acuse se aplica: rechazarlo dejaba
 * fallido o repetido algo que el aparato ya hizo.
 */
const NOW = DateTime.fromISO('2026-10-12T18:00:00Z')

const NO_PROFILE = {
  async findByAccessPoint() {
    return null
  },
} as unknown as DeviceProfileRepository

function commandOf(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    deviceCommandId: 50,
    deviceCommandWireId: 1791828000000,
    accessPointId: 33,
    businessUnitId: 3,
    deviceCommandKind: DEVICE_COMMAND_KIND.USER_UPSERT,
    deviceCommandStatus: DEVICE_COMMAND_STATUS.PENDING,
    deviceCommandAttempts: 1,
    deviceCommandMaxAttempts: 3,
    deviceCommandSentAt: null,
    deviceCommandPin: '7',
    accessPointEmployeeId: 9,
    ...overrides,
  } as DeviceCommand
}

function makeService(command: DeviceCommand) {
  const saved: DeviceCommand[] = []
  const pivotMoves: Array<{ pivotId: number; status: string }> = []
  const repository = {
    async findByWireId() {
      return command
    },
    async save(target: DeviceCommand) {
      saved.push(target)
    },
  } as unknown as DeviceCommandRepository
  const pivots = {
    async updateStatus(pivotId: number, status: string) {
      pivotMoves.push({ pivotId, status })
      return null
    },
  } as never
  return { service: new CommandAckService(repository, pivots, NO_PROFILE), saved, pivotMoves }
}

const ACK = { accessPointId: 33, body: 'ID=1791828000000&Return=0&CMD=DATA', now: NOW }

test.group('Acuse tardio de un comando reencolado', () => {
  test('un pendiente que ya viajo se acusa como si siguiera en vuelo', async ({ assert }) => {
    const { service, saved, pivotMoves } = makeService(commandOf())
    const outcome = await service.apply(ACK)

    assert.equal(outcome.kind, 'applied')
    // El alta se verifica en pantalla al acusar: queda ejecutada.
    assert.equal(saved[0].deviceCommandStatus, 'executed')
    assert.equal(saved[0].deviceCommandAckedAt, NOW)
    assert.deepEqual(pivotMoves, [{ pivotId: 9, status: 'confirmed' }])
  })

  test('un pendiente que nunca salio sigue siendo fuera de tiempo', async ({ assert }) => {
    const { service, saved } = makeService(commandOf({ deviceCommandAttempts: 0 }))
    const outcome = await service.apply(ACK)

    assert.equal(outcome.kind, 'stale')
    assert.lengthOf(saved, 0)
  })

  test('un pendiente que ya se volvio a enviar no cuenta como tardio', async ({ assert }) => {
    // `sent_at` puesto: el despacho lo reenvio y su estado real es `sent`,
    // no `pending`; este fixture solo prueba el predicado.
    assert.isFalse(
      wasDispatchedBefore({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.PENDING,
        deviceCommandAttempts: 1,
        deviceCommandSentAt: NOW,
      })
    )
    assert.isFalse(
      wasDispatchedBefore({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.FAILED,
        deviceCommandAttempts: 3,
        deviceCommandSentAt: null,
      })
    )
  })

  test('un rechazo tardio tambien se aplica: queda fallido con su motivo', async ({ assert }) => {
    const { service, saved, pivotMoves } = makeService(commandOf())
    const outcome = await service.apply({ ...ACK, body: 'ID=1791828000000&Return=-1&CMD=DATA' })

    assert.equal(outcome.kind, 'applied')
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'table_rejected')
    assert.deepEqual(pivotMoves, [{ pivotId: 9, status: 'failed' }])
  })
})
