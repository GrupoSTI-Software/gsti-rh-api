import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import type { DeviceCommandRepository } from '#modules/device-commands/device_command.repository'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
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

function makeService(awaiting: DeviceCommand[], options: { believedInside?: number } = {}) {
  const saved: DeviceCommand[] = []
  const noticed: number[] = []
  let asked: { pin?: string; bioNo?: number } | null = null
  const repository = {
    async countFacesBelievedInside() {
      return 0
    },
    async countFingerprintsBelievedInside() {
      return options.believedInside ?? 0
    },
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
  const notices = {
    async copyExecuted(templateId: number) {
      noticed.push(templateId)
      return 1
    },
  }
  return {
    service: new ExecutionEvidenceService(repository, notices),
    saved,
    noticed,
    asked: () => asked,
  }
}

test.group('Evidencia de ejecucion: huella subida', () => {
  test('la huella que sube el equipo cierra el enrolamiento que la pidio', async ({ assert }) => {
    const { service, saved } = makeService([commandOf()])
    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 3,
      bioType: BIO_TYPE.FINGERPRINT,
      now: NOW,
    })

    assert.equal(marked.closed, 1)
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
      bioType: BIO_TYPE.FINGERPRINT,
      now: NOW,
    })
    assert.equal(marked.closed, 0)
    assert.lengthOf(saved, 0)
  })

  /**
   * El equipo numera el rostro con el `No` que declare --el SenseFace sube
   * `No=0`-- asi que un rostro coincidia en PIN y numero con un enrolamiento
   * del dedo 0 y lo cerraba como ejecutado: el operador leia "captura
   * completada" y en la boveda no habia una sola huella.
   */
  test('un rostro no cierra el enrolamiento de huella del mismo numero', async ({ assert }) => {
    const { service, saved } = makeService([commandOf({ deviceCommandBioNo: 0 })])

    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 0,
      bioType: BIO_TYPE.FACE,
      now: NOW,
    })

    assert.equal(marked.closed, 0)
    assert.isNull(marked.requestedByUserId)
    assert.lengthOf(saved, 0)
  })

  /**
   * La boveda no entrega un biometrico sin saber a nombre de quien se lee, y
   * el canal no tiene sesion. Quien pidio la captura es el unico humano detras
   * de esa huella: sin el, el reparto automatico no puede ocurrir.
   */
  test('devuelve a quien pidio la captura, para poder repartirla despues', async ({ assert }) => {
    const { service } = makeService([commandOf({ deviceCommandRequestedByUserId: 77 })])

    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 3,
      bioType: BIO_TYPE.FINGERPRINT,
      now: NOW,
    })

    assert.equal(marked.requestedByUserId, 77)
  })

  test('una huella capturada a mano en el aparato no trae solicitante', async ({ assert }) => {
    const { service } = makeService([commandOf({ deviceCommandRequestedByUserId: null })])

    const marked = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 3,
      bioType: BIO_TYPE.FINGERPRINT,
      now: NOW,
    })

    assert.isNull(marked.requestedByUserId)
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
   * VLRH-H1791825638185, regla 3: la checada con huella acredita tambien las
   * COPIAS de huella de ese PIN, igual que el rostro acredita las de rostro.
   * La copia de rostro del mismo PIN se queda esperando su propia prueba.
   */
  test('una checada con huella cierra las copias de huella, no las de rostro', async ({
    assert,
  }) => {
    const { service, saved } = makeService([
      commandOf({
        deviceCommandId: 20,
        deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandCorrelationKey: 'biodata:1042:1:3',
      }),
      commandOf({
        deviceCommandId: 21,
        deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandBioNo: 9,
        deviceCommandCorrelationKey: 'biodata:1042:9:9',
      }),
    ])
    const marked = await service.fromPunch({
      accessPointId: 12,
      pin: '1042',
      verify: 1,
      now: NOW,
    })
    assert.equal(marked, 1)
    assert.deepEqual(
      saved.map((command) => command.deviceCommandId),
      [20]
    )
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

  /**
   * VLRH-H1791825638185, regla 4. Un dedo que ya estaba dentro se reescribe
   * sin mover el contador: exigir que el alza cubriera a todas dejaba a todas
   * sin acreditar y el barrido las daba por fallidas con el dato dentro. Entre
   * copias se acreditan las mas antiguas hasta donde alcanza el alza.
   */
  test('un alza que no alcanza para todas acredita las copias mas antiguas', async ({
    assert,
  }) => {
    const snapshot = { fpCount: 1, faceCount: 0, userCount: 1 }
    const { service, saved } = makeService([
      commandOf({
        deviceCommandId: 526,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandAckedAt: NOW.minus({ seconds: 5 }),
        deviceCommandCountersSnapshot: snapshot,
      }),
      commandOf({
        deviceCommandId: 525,
        deviceCommandKind: 'biodata_write',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
        deviceCommandAckedAt: NOW.minus({ seconds: 30 }),
        deviceCommandCountersSnapshot: snapshot,
      }),
    ])

    // Dos ordenes y el contador subio una: entra la que se acuso primero.
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 2, faceCount: 0, userCount: 1 },
      now: NOW,
    })

    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandId, 525)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'counter_up')
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

/**
 * Un equipo que ya tenia el dedo sin que la base lo supiera (equipo recreado,
 * huellas de antes del sistema, recopia tras un reset) no mueve el contador al
 * reescribirlo. Medido en hardware el 2026-10-12: tres copias al SenseFace
 * acusadas y sin prueba con el aparato declarando las cinco huellas.
 */
test.group('Evidencia de ejecucion: contador que cubre lo que se cree dentro', () => {
  function ackedCopy(id: number, bioNo: number): DeviceCommand {
    return commandOf({
      deviceCommandId: id,
      deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandBioNo: bioNo,
      deviceCommandCorrelationKey: `biodata:1042:1:${bioNo}`,
      biometricTemplateId: 100 + bioNo,
      deviceCommandCountersSnapshot: { fpCount: 5, faceCount: 1, userCount: 1 },
    })
  }

  test('si el contador cubre todo lo que se cree dentro, las copias acusadas quedan ejecutadas', async ({
    assert,
  }) => {
    const { service, saved, noticed } = makeService([ackedCopy(1, 6), ackedCopy(2, 8)], {
      believedInside: 5,
    })
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 5, faceCount: 1, userCount: 1 },
      now: NOW,
    })
    assert.equal(marked, 2)
    assert.isTrue(saved.every((command) => command.deviceCommandStatus === 'executed'))
    assert.isTrue(
      saved.every((command) => command.deviceCommandExecutionEvidence === 'counter_matches')
    )
    // Cada copia que llego cierra el aviso del equipo donde se capturo.
    assert.deepEqual(noticed, [106, 108])
  })

  test('si el contador queda corto, alguna no entro y ninguna se acredita', async ({ assert }) => {
    const { service, saved } = makeService([ackedCopy(1, 6), ackedCopy(2, 8)], {
      believedInside: 5,
    })
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 4, faceCount: 1, userCount: 1 },
      now: NOW,
    })
    assert.equal(marked, 0)
    assert.lengthOf(saved, 0)
  })

  test('un enrolamiento acusado no se acredita por cobertura: su dedo si debe mover el contador', async ({
    assert,
  }) => {
    const enrollment = commandOf({
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandCountersSnapshot: { fpCount: 5, faceCount: 1, userCount: 1 },
    })
    const { service, saved } = makeService([enrollment], { believedInside: 5 })
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 5, faceCount: 1, userCount: 1 },
      now: NOW,
    })
    assert.equal(marked, 0)
    assert.lengthOf(saved, 0)
  })

  test('sin nada que el sistema crea dentro, el contador no prueba una copia', async ({ assert }) => {
    const { service, saved } = makeService([ackedCopy(1, 6)], { believedInside: 0 })
    // El contador no subio desde el despacho: la unica via seria la cobertura.
    await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 5, faceCount: 1, userCount: 1 },
      now: NOW,
    })
    assert.lengthOf(saved, 0)
  })
})

test.group('Evidencia de ejecucion: aviso de huella sin repartir', () => {
  test('una checada que acredita la copia cierra el aviso del equipo de origen', async ({
    assert,
  }) => {
    const copy = commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandCorrelationKey: 'biodata:1042:1:3',
      biometricTemplateId: 151,
    })
    const { service, noticed } = makeService([copy])
    await service.fromPunch({ accessPointId: 12, pin: '1042', verify: 1, now: NOW })
    assert.deepEqual(noticed, [151])
  })

  test('un enrolamiento o una copia de rostro no tocan el aviso', async ({ assert }) => {
    const enrollment = commandOf({ deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED })
    const face = commandOf({
      deviceCommandId: 2,
      deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandCorrelationKey: 'biodata:1042:9:9',
      biometricTemplateId: 24,
    })
    const { service, noticed } = makeService([enrollment, face])
    await service.fromPunch({ accessPointId: 12, pin: '1042', verify: 1, now: NOW })
    await service.fromPunch({ accessPointId: 12, pin: '1042', verify: 15, now: NOW })
    assert.deepEqual(noticed, [])
  })
})

test.group('Evidencia de ejecucion: rostro', () => {
  const photo = (overrides: Partial<DeviceCommand> = {}) =>
    commandOf({
      deviceCommandKind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandBioNo: 9,
      deviceCommandCorrelationKey: 'biophoto:1042',
      deviceCommandCountersSnapshot: { fpCount: 10, faceCount: 4, userCount: 20 },
      ...overrides,
    })

  test('el contador de rostros que sube cierra la foto acusada', async ({ assert }) => {
    const { service, saved } = makeService([photo()])
    const marked = await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 10, faceCount: 5, userCount: 20 },
      now: NOW,
    })
    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'counter_up')
  })

  /** Antes el alza de huellas cerraba la copia de un rostro, y al reves nada la cerraba. */
  test('una huella nueva no cierra una foto, ni una cara cierra una huella', async ({
    assert,
  }) => {
    const fingerCopy = commandOf({
      deviceCommandId: 2,
      deviceCommandKind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
      deviceCommandStatus: DEVICE_COMMAND_STATUS.ACKED,
      deviceCommandCorrelationKey: 'biodata:1042:1:3',
      deviceCommandCountersSnapshot: { fpCount: 10, faceCount: 4, userCount: 20 },
    })
    const { service, saved } = makeService([photo(), fingerCopy])
    await service.fromCounters({
      accessPointId: 12,
      counters: { fpCount: 11, faceCount: 4, userCount: 20 },
      now: NOW,
    })
    assert.lengthOf(saved, 1)
    assert.equal(saved[0].deviceCommandId, 2)
  })

  test('una checada con rostro cierra la foto de ese PIN', async ({ assert }) => {
    const { service, saved } = makeService([photo()])
    const marked = await service.fromPunch({ accessPointId: 12, pin: '1042', verify: 15, now: NOW })
    assert.equal(marked, 1)
    assert.equal(saved[0].deviceCommandExecutionEvidence, 'attlog_verify')
  })

  test('el rostro que sube el equipo cierra la foto, no el enrolamiento de huella', async ({
    assert,
  }) => {
    const enroll = commandOf({ deviceCommandId: 3, deviceCommandBioNo: 0 })
    const { service, saved } = makeService([photo(), enroll])
    const outcome = await service.fromBiometricUpload({
      accessPointId: 12,
      pin: '1042',
      bioNo: 0,
      bioType: BIO_TYPE.FACE,
      now: NOW,
    })
    assert.equal(outcome.closed, 1)
    assert.isNull(outcome.requestedByUserId)
    assert.deepEqual(
      saved.map((command) => command.deviceCommandKind),
      [DEVICE_COMMAND_KIND.BIOPHOTO_WRITE]
    )
  })
})
