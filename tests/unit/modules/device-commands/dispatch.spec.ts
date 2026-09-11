import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import CommandDispatchService from '#modules/device-commands/dispatch/command_dispatch.service'
import CommandAckService from '#modules/device-commands/dispatch/command_ack.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type { DeviceCommandRepository } from '#modules/device-commands/device_command.repository'
import type DeviceCommand from '#models/device_command'
import type { PhotoDispatchPort } from '#modules/biometric-vault/photo/photo_dispatch.port'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function commandOf(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    deviceCommandId: 1,
    deviceCommandWireId: 1788912000000,
    accessPointId: 12,
    businessUnitId: 1,
    deviceCommandKind: DEVICE_COMMAND_KIND.CHECK,
    deviceCommandPayload: 'CHECK',
    deviceCommandStatus: DEVICE_COMMAND_STATUS.PENDING,
    deviceCommandPriority: 9,
    deviceCommandAttempts: 0,
    deviceCommandMaxAttempts: 3,
    ...overrides,
  } as DeviceCommand
}

interface Options {
  inFlight?: boolean
  pending?: DeviceCommand | null
  byWireId?: DeviceCommand | null
  /** Otra peticion se llevo el pendiente entre la lectura y la escritura. */
  lostRace?: boolean
}

function makeRepository(options: Options = {}) {
  const saved: DeviceCommand[] = []
  const excludedSeen: string[][] = []
  const repository: DeviceCommandRepository = {
    async enqueueIdempotent() {
      return { command: commandOf(), created: true }
    },
    async findLiveByCorrelation() {
      return null
    },
    async findById() {
      return options.byWireId ?? null
    },
    async findByIdForDevice() {
      return options.byWireId ?? null
    },
    async findByWireId() {
      return options.byWireId ?? null
    },
    async findNextPending(_id, excluded) {
      excludedSeen.push(excluded)
      return options.pending ?? null
    },
    async hasInFlight() {
      return options.inFlight === true
    },
    async listByDevice() {
      return []
    },
    async listByEmployee() {
      return []
    },
    async listLiveForPivot() {
      return []
    },
    async listLiveFingerprintWrites() {
      return []
    },
    async findStuck() {
      return []
    },
    async findAwaitingEvidence() {
      return []
    },
    async markSent(input) {
      const command = options.pending
      if (options.lostRace === true || !command) return false
      if (command.deviceCommandId !== input.commandId) return false
      if (command.deviceCommandStatus !== DEVICE_COMMAND_STATUS.PENDING) return false
      command.deviceCommandPayload = input.payload
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.SENT
      command.deviceCommandSentAt = input.sentAt
      saved.push(command)
      return true
    },
    async markFailedIfStill(input) {
      const command = options.pending
      if (!command || command.deviceCommandStatus !== input.expectedStatus) return false
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = input.failedAt
      command.deviceCommandLastError = input.error
      saved.push(command)
      return true
    },
    async save(command) {
      saved.push(command)
    },
  }
  return { repository, saved, excludedSeen }
}

test.group('Despacho de comandos', () => {
  test('entrega el pendiente con el identificador de cable y lo marca enviado', async ({
    assert,
  }) => {
    const pending = commandOf({ deviceCommandPayload: 'DATA DELETE USERINFO PIN=9999' })
    const { repository, saved } = makeRepository({ pending })
    const service = new CommandDispatchService(repository)
    const line = await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })

    assert.equal(line, 'C:1788912000000:DATA DELETE USERINFO PIN=9999')
    assert.equal(saved[0].deviceCommandStatus, 'sent')
    assert.equal(saved[0].deviceCommandSentAt, NOW)
  })

  test('con uno en vuelo no entrega otro: el equipo perderia el primero', async ({ assert }) => {
    const { repository, saved } = makeRepository({ inFlight: true, pending: commandOf() })
    const service = new CommandDispatchService(repository)
    const line = await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })
    assert.equal(line, 'OK')
    assert.lengthOf(saved, 0)
  })

  test('sin nada pendiente responde OK', async ({ assert }) => {
    const { repository } = makeRepository()
    const service = new CommandDispatchService(repository)
    assert.equal(await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true }), 'OK')
  })

  test('si otro sondeo se lo llevo primero, este no entrega nada', async ({ assert }) => {
    // El equipo reintenta el sondeo cuando la respuesta tarda: dos peticiones
    // pueden ver la cola libre y elegir el mismo comando. Solo una lo entrega.
    const pending = commandOf({ deviceCommandPayload: 'DATA DELETE USERINFO PIN=9999' })
    const { repository, saved } = makeRepository({ pending, lostRace: true })
    const service = new CommandDispatchService(repository)
    const line = await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })

    assert.equal(line, 'OK')
    assert.lengthOf(saved, 0)
  })

  /**
   * `findNextPending` ordena por prioridad e id: un comando que no se puede
   * entregar y se queda `pending` vuelve a salir en cada sondeo y ninguna otra
   * orden de ese equipo se despacha jamas. El checador se queda mudo y desde
   * el servidor todo se ve normal.
   */
  test('un comando sin payload sale de la cola en vez de taponarla', async ({ assert }) => {
    const pending = commandOf({ deviceCommandPayload: null })
    const { repository, saved } = makeRepository({ pending })
    const service = new CommandDispatchService(repository)
    const line = await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })

    assert.equal(line, 'OK')
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'payload_unreadable')
    assert.equal(saved[0].deviceCommandFailedAt, NOW)
  })

  test('una foto retirada saca su comando de la cola, no lo deja pendiente', async ({ assert }) => {
    // Retirar una foto es operacion normal --alguien la apago o la cambio-- y
    // hasta ahora dejaba el comando dando vueltas para siempre.
    const pending = commandOf({
      deviceCommandKind: 'biophoto_write',
      deviceCommandPayload: 'DATA UPDATE BIOPHOTO PIN=9999',
    })
    const { repository, saved } = makeRepository({ pending })
    const photos = {
      async refreshForDispatch() {
        return null
      },
    } as unknown as PhotoDispatchPort
    const service = new CommandDispatchService(repository, undefined, photos)
    const line = await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })

    assert.equal(line, 'OK')
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandLastError, 'photo_publication_withdrawn')
  })

  /**
   * Quien sondee de madrugada con una serie robada no recibe nada, porque no
   * hay sesion caliente que lo respalde. Es lo unico que se puede hacer contra
   * quien conoce la serie: reducir el botin.
   */
  test('sin saludo reciente no salen los comandos con biometrico', async ({ assert }) => {
    const { repository, excludedSeen } = makeRepository({ pending: commandOf() })
    const service = new CommandDispatchService(repository)

    await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: false })

    assert.deepEqual(excludedSeen[0], ['biodata_write', 'biophoto_write'])
  })

  test('con saludo reciente salen todos', async ({ assert }) => {
    const { repository, excludedSeen } = makeRepository({ pending: commandOf() })
    const service = new CommandDispatchService(repository)

    await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })

    assert.deepEqual(excludedSeen[0], [])
  })

  test('con anomalia de IP abierta se retienen los que llevan biometrico', async ({ assert }) => {
    const { repository, excludedSeen } = makeRepository({ pending: commandOf() })
    const service = new CommandDispatchService(repository)
    await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: true, hotSession: true })
    assert.deepEqual(excludedSeen[0], ['biodata_write', 'biophoto_write'])

    await service.next({ accessPointId: 12, now: NOW, ipAnomalyOpen: false, hotSession: true })
    assert.deepEqual(excludedSeen[1], [])
  })
})

test.group('Acuse de comandos', () => {
  test('Return=0 deja acusado, no ejecutado: el equipo pudo descartar el trabajo', async ({
    assert,
  }) => {
    const command = commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
    })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    const outcome = await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })

    assert.equal(outcome.kind, 'applied')
    assert.equal(saved[0].deviceCommandStatus, 'acked')
    assert.isNull(saved[0].deviceCommandExecutedAt ?? null)
  })

  test('el alta de usuario si pasa a ejecutado al acusar', async ({ assert }) => {
    const command = commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.USER_UPSERT,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
    })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })
    assert.equal(saved[0].deviceCommandStatus, 'executed')
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'ack')
  })

  /**
   * Hasta ahora bastaba con que el identificador de cable existiera: un comando
   * que nunca salio pasaba a `acked` como si hubiera viajado.
   */
  test('un comando que nunca salio no se acredita por un acuse', async ({ assert }) => {
    const command = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.PENDING })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    const outcome = await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })

    assert.equal(outcome.kind, 'stale')
    assert.lengthOf(saved, 0)
    assert.equal(command.deviceCommandStatus, 'pending')
  })

  test('un comando cancelado tampoco revive con un acuse tardio', async ({ assert }) => {
    const command = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.CANCELLED })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    const outcome = await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })

    assert.equal(outcome.kind, 'stale')
    assert.lengthOf(saved, 0)
  })

  /**
   * El equipo reenvia el acuse cuando no recibe respuesta. Tratarlo como
   * anomalia llenaria la bitacora de avisos por un comportamiento normal.
   */
  test('el mismo acuse repetido no es anomalia ni reescribe nada', async ({ assert }) => {
    const command = commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandReturnCode: 0,
    })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    const outcome = await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })

    assert.equal(outcome.kind, 'duplicate')
    assert.lengthOf(saved, 0)
  })

  test('un codigo negativo del catalogo deja el motivo legible', async ({ assert }) => {
    const command = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=-30&CMD=DATA',
      now: NOW,
    })
    assert.equal(saved[0].deviceCommandStatus, 'failed')
    assert.equal(saved[0].deviceCommandReturnCode, -30)
    assert.equal(saved[0].deviceCommandLastError, 'template_version_mismatch')
  })

  test('un codigo fuera del catalogo se marca como desconocido, no se ignora', async ({
    assert,
  }) => {
    const command = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT })
    const { repository, saved } = makeRepository({ byWireId: command })
    const service = new CommandAckService(repository)
    await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=-77&CMD=DATA',
      now: NOW,
    })
    assert.equal(saved[0].deviceCommandLastError, 'unknown_return_code')
  })

  test('un acuse de otro dispositivo no se aplica', async ({ assert }) => {
    const ajeno = commandOf({ accessPointId: 99 })
    const { repository, saved } = makeRepository({ byWireId: ajeno })
    const service = new CommandAckService(repository)
    const outcome = await service.apply({
      accessPointId: 12,
      body: 'ID=1788912000000&Return=0&CMD=DATA',
      now: NOW,
    })
    assert.equal(outcome.kind, 'orphan')
    assert.lengthOf(saved, 0)
  })

  test('un cuerpo ilegible se reporta sin tocar nada', async ({ assert }) => {
    const { repository, saved } = makeRepository()
    const service = new CommandAckService(repository)
    const outcome = await service.apply({ accessPointId: 12, body: 'basura', now: NOW })
    assert.equal(outcome.kind, 'unreadable')
    assert.lengthOf(saved, 0)
  })
})
