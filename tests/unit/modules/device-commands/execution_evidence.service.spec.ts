import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
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
    accessPointId: 12,
    deviceCommandKind: DEVICE_COMMAND_KIND.ENROLL_FP,
    deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
    deviceCommandPin: '1042',
    deviceCommandBioNo: 3,
    ...overrides,
  } as DeviceCommand
}

function makeService(awaiting: DeviceCommand[]) {
  const saved: DeviceCommand[] = []
  let asked: { pin?: string; bioNo?: number } | null = null
  const repository = {
    async findAwaitingEvidence(input: { pin?: string; bioNo?: number }) {
      asked = input
      return awaiting.filter(
        (command) =>
          (input.pin === undefined || command.deviceCommandPin === input.pin) &&
          (input.bioNo === undefined || command.deviceCommandBioNo === input.bioNo)
      )
    },
    async save(command: DeviceCommand) {
      saved.push(command)
    },
  } as unknown as DeviceCommandRepository
  return { service: new ExecutionEvidenceService(repository), saved, asked: () => asked }
}

test.group('Evidencia de ejecucion: huella subida', () => {
  test('la huella que sube el equipo cierra el enrolamiento que la pidio', async ({ assert }) => {
    const { service, saved } = makeService([commandOf()])
    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 3,
      now: NOW,
    })

    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandStatus, 'executed')
    assert.equal(saved[0].deviceCommandExecutedAt, NOW)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'biometric_upload')
  })

  test('otro dedo del mismo colaborador no cierra este enrolamiento', async ({ assert }) => {
    const { service, saved } = makeService([commandOf({ deviceCommandBioNo: 3 })])
    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 7,
      now: NOW,
    })
    assert.equal(marked, 0)
    assert.lengthOf(saved, 0)
  })
})

test.group('Evidencia de ejecucion: checada con huella', () => {
  test('una checada verificada con huella prueba que la huella quedo dentro', async ({
    assert,
  }) => {
    const { service, saved } = makeService([commandOf()])
    const marked = await service.fromPunch({
      accessPointId: 12,
      pin: '1042',
      verify: 1,
      now: NOW,
    })
    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'attlog_verify')
  })

  /**
   * Marcar con rostro o con contraseña no dice nada de la huella que se pidio.
   */
  test('una checada con otro metodo no cierra nada', async ({ assert }) => {
    const { service, saved } = makeService([commandOf()])
    for (const verify of [0, 15, 20, null]) {
      assert.equal(
        await service.fromPunch({ accessPointId: 12, pin: '1042', verify, now: NOW }),
        0
      )
    }
    assert.lengthOf(saved, 0)
  })
})

test.group('Evidencia de ejecucion: contadores del equipo', () => {
  test('el contador que sube cierra el unico enrolamiento acusado', async ({ assert }) => {
    const acked = commandOf({
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandCountersSnapshot: { fpCount: 10, faceCount: 2, userCount: 5 },
    })
    const { service, saved } = makeService([acked])
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 11, faceCount: 2, userCount: 5 },
      now: NOW,
    })
    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'counter_up')
  })

  /**
   * Una copia no hace que el equipo suba nada --ya tiene el dato-- asi que el
   * contador es su unica prueba automatica. Sin esto, una replicacion acusada
   * esperaba para siempre una evidencia que nadie iba a mandar y el expediente
   * negaba una huella que si estaba dentro del aparato.
   */
  test('el contador tambien cierra las copias acusadas', async ({ assert }) => {
    const snapshot = { fpCount: 1, faceCount: 0, userCount: 1 }
    const { service, saved } = makeService([
      commandOf({
        deviceCommandId: 525,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
      commandOf({
        deviceCommandId: 526,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
    ])

    // Dos ordenes y el contador subio dos: el alza explica a las dos.
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 3, faceCount: 0, userCount: 1 },
      now: NOW,
    })

    assert.equal(marked, 2)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'counter_up')
  })

  test('un alza que no alcanza para todas no cierra ninguna', async ({ assert }) => {
    const snapshot = { fpCount: 1, faceCount: 0, userCount: 1 }
    const { service } = makeService([
      commandOf({
        deviceCommandId: 525,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
      commandOf({
        deviceCommandId: 526,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
    ])

    // Dos ordenes y el contador subio una: no se sabe cual entro.
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 2, faceCount: 0, userCount: 1 },
      now: NOW,
    })

    assert.equal(marked, 0)
  })

  /**
   * El contador no dice DE QUIEN es la huella nueva. Con dos enrolamientos
   * abiertos, acreditarle el aumento a uno seria adivinar.
   */
  test('con dos enrolamientos abiertos el contador no acredita a ninguno', async ({ assert }) => {
    const snapshot = { fpCount: 10, faceCount: 2, userCount: 5 }
    const { service, saved } = makeService([
      commandOf({
        deviceCommandId: 1,
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
      commandOf({
        deviceCommandId: 2,
        deviceCommandBioNo: 7,
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: snapshot,
      }),
    ])
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 11, faceCount: 2, userCount: 5 },
      now: NOW,
    })
    assert.equal(marked, 0)
    assert.lengthOf(saved, 0)
  })

  test('sin linea base guardada al acusar, ningun aumento se acredita', async ({ assert }) => {
    const { service } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: null,
      }),
    ])
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 99, faceCount: 2, userCount: 5 },
      now: NOW,
    })
    assert.equal(marked, 0)
  })

  test('un contador que no sube no prueba nada', async ({ assert }) => {
    const { service } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCountersSnapshot: { fpCount: 10, faceCount: 2, userCount: 5 },
      }),
    ])
    assert.equal(
      await service.fromCounters({
        accessPointId: 12,
        counters: { fpCount: 10, faceCount: 2, userCount: 5 },
        now: NOW,
      }),
      0
    )
  })

  /**
   * Un `sent` sin acuse no tiene snapshot: el contador que sube en ese momento
   * puede ser de una huella que alguien enrolo a mano en el aparato.
   */
  test('un comando aun sin acusar no se cierra por contadores', async ({ assert }) => {
    const { service } = makeService([
      commandOf({
        deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
        deviceCommandCountersSnapshot: { fpCount: 10, faceCount: 2, userCount: 5 },
      }),
    ])
    assert.equal(
      await service.fromCounters({
        accessPointId: 12,
        counters: { fpCount: 11, faceCount: 2, userCount: 5 },
        now: NOW,
      }),
      0
    )
  })
})
