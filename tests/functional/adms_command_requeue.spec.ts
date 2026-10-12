import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_FAILURE,
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import { TenantContext } from '#utils/tenant_context'

/**
 * VLRH-H1791825638812: una sola politica para lo que salio y nadie acuso, la
 * del barrido. Aqui se prueba el adaptador que la ejecuta, condicionado al
 * estado y bajo candado de fila.
 */
const STAMP = `${Date.now()}`

test.group('Comandos en vuelo sin acuse', (group) => {
  let accessPointId = 0
  let businessUnitId = 0
  const commandIds: number[] = []

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query().whereNull('business_unit_deleted_at').firstOrFail()
      businessUnitId = unit.businessUnitId
      const point = await TenantContext.run([businessUnitId], () =>
        AccessPoint.create({
          accessPointName: `Equipo cola ${STAMP}`,
          businessUnitId,
          accessPointSerialNumber: `TESTW${STAMP}`.slice(0, 24),
          accessPointActive: 1,
          accessPointStatus: 1,
        })
      )
      accessPointId = point.accessPointId
    }, 'fixture del rescate de comandos')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (commandIds.length > 0) {
        await db.from('device_commands').whereIn('device_command_id', commandIds).delete()
      }
      await db.from('device_commands').where('access_point_id', accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPointId).delete()
    }, 'limpieza del rescate de comandos')
  })

  /** Comando ya despachado, con el `sent_at`, los intentos y el tipo que se indiquen. */
  async function enVuelo(
    attempts = 0,
    maxAttempts: number | null = 3,
    kind: string = DEVICE_COMMAND_KIND.INFO
  ) {
    return TenantContext.runUnscoped(async () => {
      const command = await DeviceCommand.create({
        accessPointId,
        businessUnitId,
        deviceCommandWireId: Number(`${Date.now()}`.slice(-9)) + commandIds.length,
        deviceCommandKind: kind as typeof DEVICE_COMMAND_KIND.INFO,
        deviceCommandPayload: 'INFO',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
        deviceCommandSentAt: DateTime.utc().minus({ minutes: 10 }),
        deviceCommandAttempts: attempts,
        deviceCommandMaxAttempts: maxAttempts,
        deviceCommandPriority: 100,
        deviceCommandCountersSnapshot: { userCount: 1, fpCount: 2, faceCount: 1 },
      })
      commandIds.push(command.deviceCommandId)
      return command
    }, 'alta de comando en vuelo')
  }

  /** El adaptador corre dentro del bypass, igual que lo invoca el barrido. */
  async function vencer(commandId: number, expected: string = DEVICE_COMMAND_STATUS.SENT) {
    return TenantContext.runUnscoped(
      () =>
        new DeviceCommandRepositoryMysql().requeueOrFailIfStill({
          commandId,
          expectedStatus: expected as typeof DEVICE_COMMAND_STATUS.SENT,
          now: DateTime.utc(),
          error: DEVICE_COMMAND_FAILURE.INFLIGHT_TIMEOUT,
        }),
      'vencimiento'
    )
  }

  async function fresco(commandId: number) {
    return TenantContext.runUnscoped(() => DeviceCommand.findOrFail(commandId), 'verificacion')
  }

  test('un comando sin acusar vuelve a la cola y suma un intento', async ({ assert }) => {
    const command = await enVuelo()

    assert.equal(await vencer(command.deviceCommandId), 'requeued')

    const actual = await fresco(command.deviceCommandId)
    assert.equal(actual.deviceCommandStatus, DEVICE_COMMAND_STATUS.PENDING)
    assert.equal(actual.deviceCommandAttempts, 1)
    assert.isNull(actual.deviceCommandSentAt, 'vuelve a la cola limpio, como si no hubiera salido')
    // La linea base de contadores se conserva: se tomo antes de que el equipo viera la orden.
    assert.deepEqual(actual.deviceCommandCountersSnapshot, { userCount: 1, fpCount: 2, faceCount: 1 })
  })

  /** El que ya no esta en el estado leido no se toca: el acuse entro en medio. */
  test('si el estado cambio entre la lectura y la escritura, no se toca', async ({ assert }) => {
    const command = await enVuelo()

    assert.equal(await vencer(command.deviceCommandId, DEVICE_COMMAND_STATUS.ACKED), 'untouched')

    const actual = await fresco(command.deviceCommandId)
    assert.equal(actual.deviceCommandStatus, DEVICE_COMMAND_STATUS.SENT)
    assert.equal(actual.deviceCommandAttempts, 0)
  })

  /** Una orden que el equipo no puede ejecutar no se reintenta para siempre. */
  test('al agotar los intentos queda fallido, no reencolado', async ({ assert }) => {
    const command = await enVuelo(2, 3)

    assert.equal(await vencer(command.deviceCommandId), 'failed')

    const actual = await fresco(command.deviceCommandId)
    assert.equal(actual.deviceCommandStatus, DEVICE_COMMAND_STATUS.FAILED)
    assert.equal(actual.deviceCommandAttempts, 3)
    assert.equal(actual.deviceCommandLastError, DEVICE_COMMAND_FAILURE.INFLIGHT_TIMEOUT)
    assert.isNotNull(actual.deviceCommandFailedAt)
  })

  /**
   * `null` en el maximo es "insiste siempre": lo usa la baja de usuario, donde
   * rendirse deja a alguien con acceso que ya no le toca.
   */
  test('sin tope de intentos se reencola por muchas veces que lleve', async ({ assert }) => {
    const command = await enVuelo(99, null, DEVICE_COMMAND_KIND.USER_DELETE)

    assert.equal(await vencer(command.deviceCommandId), 'requeued')

    const actual = await fresco(command.deviceCommandId)
    assert.equal(actual.deviceCommandStatus, DEVICE_COMMAND_STATUS.PENDING)
    assert.equal(actual.deviceCommandAttempts, 100)
  })

  /** Reabrir la captura sin la persona enfrente no sirve: se falla a la primera. */
  test('el enrolamiento presencial vencido queda fallido aunque le queden intentos', async ({
    assert,
  }) => {
    const command = await enVuelo(0, 3, DEVICE_COMMAND_KIND.ENROLL_FP)

    assert.equal(await vencer(command.deviceCommandId), 'failed')

    const actual = await fresco(command.deviceCommandId)
    assert.equal(actual.deviceCommandStatus, DEVICE_COMMAND_STATUS.FAILED)
    assert.equal(actual.deviceCommandAttempts, 1)
  })
})
