import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type {
  CommandInsert,
  DeviceCommandRepository,
} from '#modules/device-commands/device_command.repository'
import type DeviceCommand from '#models/device_command'
import { DeviceCommandError } from '#exceptions/device_command_error'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function commandOf(overrides: Partial<DeviceCommand> = {}): DeviceCommand {
  return {
    deviceCommandId: 1,
    deviceCommandWireId: 1788912000000,
    accessPointId: 12,
    businessUnitId: 1,
    deviceCommandKind: DEVICE_COMMAND_KIND.USER_UPSERT,
    deviceCommandStatus: DEVICE_COMMAND_STATUS.PENDING,
    deviceCommandPriority: 3,
    deviceCommandAttempts: 0,
    deviceCommandMaxAttempts: 3,
    ...overrides,
  } as DeviceCommand
}

interface Options {
  live?: DeviceCommand | null
  existing?: DeviceCommand | null
  duplicateWireIds?: number
  /** Lo que sigue vivo para el vinculo al cerrarlo. */
  liveForPivot?: DeviceCommand[]
}

/** Lo que el adaptador habria escrito, con el identificador que le toco. */
type InsertedCommand = CommandInsert & { wireId: number }

function makeService(options: Options = {}) {
  const inserted: InsertedCommand[] = []
  const saved: DeviceCommand[] = []
  let remainingDuplicates = options.duplicateWireIds ?? 0

  const repository: DeviceCommandRepository = {
    async enqueueIdempotent(input, wireIdCandidates) {
      if (options.live) return { command: options.live, created: false }
      // El adaptador real prueba los candidatos en orden hasta que uno entra.
      const usable = wireIdCandidates.slice(remainingDuplicates)
      if (usable.length === 0) return null
      inserted.push({ ...input, wireId: usable[0] } as CommandInsert & { wireId: number })
      return {
        command: commandOf({ deviceCommandWireId: usable[0], deviceCommandKind: input.kind }),
        created: true,
      }
    },
    async findLiveByCorrelation() {
      return options.live ?? null
    },
    async findById() {
      return options.existing ?? null
    },
    async findByIdForDevice() {
      return null
    },
    async findByWireId() {
      return options.existing ?? null
    },
    async findNextPending() {
      return null
    },
    async hasInFlight() {
      return false
    },
    async listByDevice() {
      return []
    },
    async listLiveForPivot() {
      return options.liveForPivot ?? []
    },
    async listLiveFingerprintWrites() {
      return []
    },
    async listByEmployee() {
      return []
    },
    async findStuck() {
      return []
    },
    async findAwaitingEvidence() {
      return []
    },
    async markSent() {
      return true
    },
    async markFailedIfStill() {
      return true
    },
    async save(command) {
      saved.push(command)
    },
  }

  const service = new DeviceCommandService(
    repository,
    () => NOW,
    () => 1788912000000
  )
  return { service, inserted, saved }
}

test.group('Cola de comandos: encolado', () => {
  test('encola con la gramatica ya formateada y la prioridad del tipo', async ({ assert }) => {
    const { service, inserted } = makeService()
    const result = await service.enqueue({
      accessPointId: 12,
      businessUnitId: 1,
      kind: DEVICE_COMMAND_KIND.USER_UPSERT,
      fields: { pin: '9999', name: 'Juan Perez' },
      correlationKey: 'user_upsert:9999',
    })

    assert.isTrue(result.created)
    assert.lengthOf(inserted, 1)
    assert.include(inserted[0].payload, 'DATA UPDATE USERINFO PIN=9999')
    assert.equal(inserted[0].priority, 3)
    assert.equal(inserted[0].maxAttempts, 3)
    assert.equal(inserted[0].correlationKey, 'user_upsert:9999')
  })

  test('con un comando vivo de la misma llave devuelve el existente y no crea otro', async ({
    assert,
  }) => {
    const live = commandOf({ deviceCommandId: 5 })
    const { service, inserted } = makeService({ live })
    const result = await service.enqueue({
      accessPointId: 12,
      businessUnitId: 1,
      kind: DEVICE_COMMAND_KIND.USER_UPSERT,
      fields: { pin: '9999', name: 'Juan' },
      correlationKey: 'user_upsert:9999',
    })

    assert.isFalse(result.created)
    assert.equal(result.command.deviceCommandId, 5)
    assert.lengthOf(inserted, 0)
  })

  test('una colision de identificador se resuelve subiendo de uno en uno', async ({ assert }) => {
    const { service, inserted } = makeService({ duplicateWireIds: 2 })
    const result = await service.enqueue({
      accessPointId: 12,
      businessUnitId: 1,
      kind: DEVICE_COMMAND_KIND.CHECK,
      fields: {},
    })
    assert.equal(inserted[0].wireId, 1788912000002)
    assert.equal(result.command.deviceCommandWireId, 1788912000002)
    assert.isTrue(result.created)
  })

  test('si no hay identificador libre tras cinco intentos, falla explicitamente', async ({
    assert,
  }) => {
    const { service } = makeService({ duplicateWireIds: 99 })
    let capturado: unknown = null
    try {
      await service.enqueue({
        accessPointId: 12,
        businessUnitId: 1,
        kind: DEVICE_COMMAND_KIND.CHECK,
        fields: {},
      })
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, DeviceCommandError)
    assert.equal((capturado as DeviceCommandError).code, 'DCMD.SYS.001')
  })

  test('el borrado de usuario no lleva tope de intentos', async ({ assert }) => {
    const { service, inserted } = makeService()
    await service.enqueue({
      accessPointId: 12,
      businessUnitId: 1,
      kind: DEVICE_COMMAND_KIND.USER_DELETE,
      fields: { pin: '9999' },
    })
    assert.isNull(inserted[0].maxAttempts)
    assert.equal(inserted[0].priority, 1)
  })
})

test.group('Cola de comandos: estados', () => {
  test('cancelar solo procede sobre un pendiente', async ({ assert }) => {
    const pendiente = commandOf()
    const { service, saved } = makeService({ existing: pendiente })
    const cancelado = await service.cancel(1, 44)
    assert.equal(cancelado.deviceCommandStatus, 'cancelled')
    assert.lengthOf(saved, 1)

    const enviado = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT })
    const otro = makeService({ existing: enviado })
    let capturado: unknown = null
    try {
      await otro.service.cancel(1, 44)
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, DeviceCommandError)
    assert.equal((capturado as DeviceCommandError).code, 'DCMD.STATE.003')
  })

  /**
   * Cerrar el vinculo alcanza tambien a lo que ya salio, y ahi cancelar no es
   * una opcion: la maquina no admite `sent -> cancelled` (spec 6.2). Antes se
   * intentaba igual, lanzaba en el primer `sent` y dejaba a medias el cierre
   * que este metodo promete -- justo cuando se usa para sacar a alguien de un
   * equipo.
   */
  test('cerrar el vinculo cancela lo pendiente y da por fallido lo que ya salio', async ({
    assert,
  }) => {
    const pendiente = commandOf()
    const enVuelo = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT })
    const { service, saved } = makeService({ liveForPivot: [pendiente, enVuelo] })

    const cerrados = await service.cancelLiveForPivot(5, 44)

    assert.equal(cerrados, 2)
    assert.equal(pendiente.deviceCommandStatus, 'cancelled')
    assert.equal(enVuelo.deviceCommandStatus, 'failed')
    assert.isNotNull(enVuelo.deviceCommandLastError)
    assert.lengthOf(saved, 2)
  })

  test('reintentar solo procede sobre un fallido y sube el contador', async ({ assert }) => {
    const fallido = commandOf({
      deviceCommandStatus: DEVICE_COMMAND_STATUS.FAILED,
      deviceCommandAttempts: 1,
      deviceCommandLastError: 'inflight_timeout',
    })
    const { service } = makeService({ existing: fallido })
    const reintentado = await service.retry(1, 44)
    assert.equal(reintentado.deviceCommandStatus, 'pending')
    assert.equal(reintentado.deviceCommandAttempts, 2)
    assert.isNull(reintentado.deviceCommandLastError)
  })

  test('un comando que agoto sus intentos no se reintenta', async ({ assert }) => {
    const agotado = commandOf({
      deviceCommandStatus: DEVICE_COMMAND_STATUS.FAILED,
      deviceCommandAttempts: 3,
      deviceCommandMaxAttempts: 3,
    })
    const { service } = makeService({ existing: agotado })
    let capturado: unknown = null
    try {
      await service.retry(1, 44)
    } catch (error) {
      capturado = error
    }
    assert.equal((capturado as DeviceCommandError).code, 'DCMD.STATE.002')
  })

  test('el borrado de usuario se puede reintentar siempre', async ({ assert }) => {
    const fallido = commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.USER_DELETE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.FAILED,
      deviceCommandAttempts: 12,
      deviceCommandMaxAttempts: null,
    })
    const { service } = makeService({ existing: fallido })
    const reintentado = await service.retry(1, 44)
    assert.equal(reintentado.deviceCommandStatus, 'pending')
    assert.equal(reintentado.deviceCommandAttempts, 13)
  })

  test('una transicion fuera de la maquina se rechaza', async ({ assert }) => {
    const { service } = makeService()
    const ejecutado = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.EXECUTED })
    assert.throws(() => service.transition(ejecutado, DEVICE_COMMAND_STATUS.PENDING))
    const cancelado = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.CANCELLED })
    assert.throws(() => service.transition(cancelado, DEVICE_COMMAND_STATUS.SENT))
    // Nada llega a `expired` desde `sent`: la decision D4 no expira comandos.
    const enviado = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT })
    assert.throws(() => service.transition(enviado, DEVICE_COMMAND_STATUS.EXPIRED))
  })

  test('las transiciones legitimas del camino feliz pasan', async ({ assert }) => {
    const { service } = makeService()
    const command = commandOf()
    service.transition(command, DEVICE_COMMAND_STATUS.SENT)
    service.transition(command, DEVICE_COMMAND_STATUS.ACKED)
    service.transition(command, DEVICE_COMMAND_STATUS.EXECUTED)
    assert.equal(command.deviceCommandStatus, 'executed')
  })
})
