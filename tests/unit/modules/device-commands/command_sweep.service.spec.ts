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
    deviceCommandAttempts: 0,
    deviceCommandMaxAttempts: 3,
    deviceCommandSentAt: NOW.minus({ minutes: 5 }),
    ...overrides,
  } as DeviceCommand
}

/** Un comando que ya agoto sus intentos: el siguiente vencimiento lo falla. */
function exhausted(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return commandOf({ deviceCommandAttempts: 2, deviceCommandMaxAttempts: 3, ...overrides })
}

function makeService(
  stuck: DeviceCommand[],
  statusChangedUnderfoot = false,
  closedRevocations = 0
) {
  const saved: DeviceCommand[] = []
  let asked: Parameters<DeviceCommandRepository['findStuck']>[0] | null = null
  const repository = {
    async findStuck(input: Parameters<DeviceCommandRepository['findStuck']>[0]) {
      asked = input
      return stuck
    },
    async markFailedIfStill(input: Parameters<DeviceCommandRepository['markFailedIfStill']>[0]) {
      const command = stuck.find((row) => row.deviceCommandId === input.commandId)
      if (!command) return false
      // La condicion real vive en el UPDATE; aqui se simula que el acuse
      // cambio el estado entre la lectura de la tanda y la escritura.
      if (statusChangedUnderfoot || command.deviceCommandStatus !== input.expectedStatus) {
        return false
      }
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = input.failedAt
      command.deviceCommandLastError = input.error
      saved.push(command)
      return true
    },
    /** Espejo de la politica del adaptador: reencola mientras queden intentos. */
    async requeueOrFailIfStill(
      input: Parameters<DeviceCommandRepository['requeueOrFailIfStill']>[0]
    ) {
      const command = stuck.find((row) => row.deviceCommandId === input.commandId)
      if (!command) return 'untouched' as const
      if (statusChangedUnderfoot || command.deviceCommandStatus !== input.expectedStatus) {
        return 'untouched' as const
      }
      const attempts = command.deviceCommandAttempts + 1
      const max = command.deviceCommandMaxAttempts
      command.deviceCommandAttempts = attempts
      if ((max !== null && attempts >= max) || command.deviceCommandKind === 'enroll_fp') {
        command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
        command.deviceCommandFailedAt = input.now
        command.deviceCommandLastError = input.error
        saved.push(command)
        return 'failed' as const
      }
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.PENDING
      command.deviceCommandSentAt = null
      saved.push(command)
      return 'requeued' as const
    },
    async save(command: DeviceCommand) {
      saved.push(command)
    },
  } as unknown as DeviceCommandRepository
  /**
   * Dobles de las dos colaboraciones que tocan la base fuera del repositorio:
   * sin ellas la prueba unitaria acabaria consultando MySQL.
   */
  const enqueued: unknown[] = []
  const commands = {
    async enqueue(input: unknown) {
      enqueued.push(input)
      return { command: { deviceCommandId: 1 }, created: true }
    },
  } as never
  const roster = {
    async closeSilentRevocations() {
      return closedRevocations
    },
  } as never

  /** A que estado se solto cada vinculo que el barrido cerro. */
  const released: Array<{ pivotId: number; status: string }> = []
  const pivots = {
    async updateStatus(pivotId: number, status: string) {
      released.push({ pivotId, status })
      return null
    },
  } as never

  return {
    service: new CommandSweepService(repository, () => NOW, commands, roster, pivots),
    saved,
    asked: () => asked,
    enqueued,
    released,
  }
}

test.group('Barrido de comandos colgados', () => {
  /**
   * VLRH-H1791825638812, reglas 1 a 3. Antes el barrido fallaba la orden al
   * primer vencimiento y soltaba el vinculo; el reencolado vivia en el despacho
   * a cinco minutos y nunca llegaba a correr. Una sola politica, aqui.
   */
  test('un comando en vuelo sin acuse vuelve a la cola con un intento mas', async ({
    assert,
  }) => {
    const { service, saved, released } = makeService([
      commandOf({
        deviceCommandKind: DEVICE_COMMAND_KIND.USER_UPSERT,
        accessPointEmployeeId: 5,
      }),
    ])
    const result = await service.run()

    assert.equal(result.requeued, 1)
    assert.equal(result.timedOut, 0)
    assert.equal(saved[0].deviceCommandStatus, 'pending')
    assert.equal(saved[0].deviceCommandAttempts, 1)
    assert.isNull(saved[0].deviceCommandSentAt)
    // Mientras se reintenta, el vinculo sigue su camino: no se suelta.
    assert.lengthOf(released, 0)
  })

  test('al agotar los intentos pasa a fallido con su motivo', async ({ assert }) => {
    const { service, saved } = makeService([exhausted()])
    const result = await service.run()
    assert.equal(result.timedOut, 1)
    assert.equal(result.requeued, 0)
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandAttempts, 3)
    assert.equal(saved[0].deviceCommandLastError, 'inflight_timeout')
    assert.equal(saved[0].deviceCommandFailedAt, NOW)
  })

  /** `null` en el tope es "insiste siempre": dejar a un ex-colaborador dentro es un riesgo. */
  test('la baja de usuario vuelve a la cola por muchos intentos que lleve', async ({ assert }) => {
    const { service, saved, released } = makeService([
      commandOf({
        deviceCommandKind: DEVICE_COMMAND_KIND.USER_DELETE,
        accessPointEmployeeId: 5,
        deviceCommandAttempts: 40,
        deviceCommandMaxAttempts: null,
      }),
    ])
    const result = await service.run()

    assert.equal(result.requeued, 1)
    assert.equal(saved[0].deviceCommandStatus, 'pending')
    assert.equal(saved[0].deviceCommandAttempts, 41)
    assert.lengthOf(released, 0)
  })

  /** Reabrir la captura sin la persona enfrente no sirve: se falla a la primera. */
  test('el enrolamiento presencial vencido no se reintenta solo', async ({ assert }) => {
    const { service, saved } = makeService([
      commandOf({ deviceCommandKind: DEVICE_COMMAND_KIND.ENROLL_FP }),
    ])
    const result = await service.run()
    assert.equal(result.timedOut, 1)
    assert.equal(result.requeued, 0)
    assert.equal(saved[0].deviceCommandStatus, 'failed')
  })

  /**
   * El barrido cerraba el COMANDO y dejaba el pivote en `sent`. Desde ahi la
   * maquina solo admite `confirmed` y `failed`, las dos condicionadas a que el
   * aparato vuelva a hablar: si el equipo recogio el alta y se apago, no habia
   * forma de revocar, reenviar ni retirar. La persona quedaba dentro del
   * checador sin una sola via para sacarla.
   */
  test('el alta que agota sus intentos suelta tambien el vinculo', async ({ assert }) => {
    const { service, released } = makeService([
      exhausted({
        deviceCommandKind: DEVICE_COMMAND_KIND.USER_UPSERT,
        accessPointEmployeeId: 5,
      }),
    ])

    await service.run()

    assert.deepEqual(released, [{ pivotId: 5, status: 'failed' }])
  })

  test('si lo que se perdio era la baja y ya no hay intentos, el vinculo queda en revoke_failed', async ({
    assert,
  }) => {
    const { service, released } = makeService([
      exhausted({
        deviceCommandKind: DEVICE_COMMAND_KIND.USER_DELETE,
        accessPointEmployeeId: 5,
        // Una baja con tope explicito: la de produccion no lo tiene.
        deviceCommandMaxAttempts: 3,
      }),
    ])

    await service.run()

    assert.deepEqual(released, [{ pivotId: 5, status: 'revoke_failed' }])
  })

  test('un comando suelto no le cambia el estado a nadie', async ({ assert }) => {
    const { service, released } = makeService([exhausted()])
    await service.run()
    assert.lengthOf(released, 0)
  })

  test('si el acuse llego entre la lectura y la escritura, no se toca', async ({ assert }) => {
    // El barrido lee una tanda y la procesa en fila. Mover una orden que el
    // equipo si ejecuto hace que el operador la reintente y el aparato la repita.
    const { service, saved } = makeService([commandOf()], true)
    const result = await service.run()
    assert.equal(result.timedOut, 0)
    assert.equal(result.requeued, 0)
    assert.lengthOf(saved, 0)
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

  test('el ajuste de reloj acusado tampoco falla: su evidencia es una checada futura', async ({
    assert,
  }) => {
    const { service, saved } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandKind: DEVICE_COMMAND_KIND.CLOCK_SYNC,
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
    assert.deepEqual(result, {
      taken: 0,
      requeued: 0,
      timedOut: 0,
      withoutEvidence: 0,
      rosterRequested: 0,
      revocationsClosed: 0,
    })
    assert.lengthOf(saved, 0)
  })

  test('las bajas cerradas por silencio se cuentan en el resultado', async ({ assert }) => {
    const { service } = makeService([], false, 2)

    const result = await service.run()

    // Cerrar una baja es trabajo aunque no hubiera comandos colgados.
    assert.equal(result.revocationsClosed, 2)
  })
})
