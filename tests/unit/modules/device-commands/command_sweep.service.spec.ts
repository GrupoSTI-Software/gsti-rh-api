import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import CommandSweepService from '#modules/device-commands/sweep/command_sweep.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type { DeviceCommandRepository } from '#modules/device-commands/device_command.repository'
import type DeviceCommand from '#models/device_command'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function commandOf(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    deviceCommandId: 1,
    deviceCommandWireId: 1,
    accessPointId: 12,
    businessUnitId: 1,
    deviceCommandKind: DEVICE_COMMAND_KIND.CHECK,
    deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
    ...overrides,
  } as DeviceCommand
}

function makeService(stuck: DeviceCommand[]) {
  const saved: DeviceCommand[] = []
  let asked: Parameters<DeviceCommandRepository['findStuck']>[0] | null = null
  const repository = {
    async findStuck(input: Parameters<DeviceCommandRepository['findStuck']>[0]) {
      asked = input
      return stuck
    },
    async save(command: DeviceCommand) {
      saved.push(command)
    },
  } as unknown as DeviceCommandRepository
  return {
    service: new CommandSweepService(repository, () => NOW),
    saved,
    asked: () => asked,
  }
}

test.group('Barrido de comandos colgados', () => {
  test('un comando en vuelo sin acuse pasa a fallido con su motivo', async ({ assert }) => {
    const { service, saved } = makeService([commandOf()])
    const result = await service.run()
    assert.equal(result.timedOut, 1)
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'inflight_timeout')
    assert.equal(saved[0].deviceCommandFailedAt, NOW)
  })

  test('un acusado sin evidencia pasa a fallido', async ({ assert }) => {
    const { service, saved } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandKind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
      }),
    ])
    const result = await service.run()
    assert.equal(result.withoutEvidence, 1)
    assert.equal(saved[0].deviceCommandLastError, 'no_evidence')
  })

  test('el borrado de usuario acusado nunca falla por falta de evidencia', async ({ assert }) => {
    const { service, saved } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandKind: DEVICE_COMMAND_KIND.USER_DELETE,
      }),
    ])
    const result = await service.run()
    assert.equal(result.withoutEvidence, 0)
    assert.lengthOf(saved, 0)
  })

  test('el enrolamiento tiene un plazo mas corto porque se hace con el dedo puesto', async ({
    assert,
  }) => {
    const { service, asked } = makeService([])
    await service.run()
    const input = asked()
    assert.isNotNull(input)
    assert.equal(input!.sentBefore.toISO(), NOW.minus({ seconds: 180 }).toISO())
    assert.equal(input!.enrollSentBefore.toISO(), NOW.minus({ seconds: 120 }).toISO())
    assert.equal(input!.ackedBefore.toISO(), NOW.minus({ minutes: 30 }).toISO())
  })

  test('sin nada colgado no toca nada', async ({ assert }) => {
    const { service, saved } = makeService([])
    const result = await service.run()
    assert.deepEqual(result, { taken: 0, timedOut: 0, withoutEvidence: 0 })
    assert.lengthOf(saved, 0)
  })
})
