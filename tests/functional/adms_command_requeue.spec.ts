import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import DeviceCommand from '#models/device_command'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { TenantContext } from '#utils/tenant_context'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'

/**
 * Rescate de los comandos que salieron y nadie acuso.
 *
 * Solo se despacha uno a la vez, asi que uno en vuelo que jamas se acusa
 * taponaba la cola entera de ese equipo. Basta un corte de luz entre recibir
 * la orden y acusarla: el checador sigue sondeando, el servidor sigue
 * contestando OK, y ninguna alta vuelve a salir.
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

  /** Comando ya despachado, con el `sent_at` que se le indique. */
  async function enVuelo(sentAt: DateTime, attempts = 0, maxAttempts: number | null = 3) {
    return TenantContext.runUnscoped(async () => {
      const command = await DeviceCommand.create({
        accessPointId,
        businessUnitId,
        deviceCommandWireId: Number(`${Date.now()}`.slice(-9)) + commandIds.length,
        deviceCommandKind: DEVICE_COMMAND_KIND.INFO,
        deviceCommandPayload: 'INFO',
        deviceCommandStatus: DEVICE_COMMAND_STATUS.SENT,
        deviceCommandSentAt: sentAt,
        deviceCommandAttempts: attempts,
        deviceCommandMaxAttempts: maxAttempts,
        deviceCommandPriority: 100,
      })
      commandIds.push(command.deviceCommandId)
      return command
    }, 'alta de comando en vuelo')
  }

  test('un comando sin acusar vuelve a la cola y suma un intento', async ({ assert }) => {
    const command = await enVuelo(DateTime.utc().minus({ minutes: 10 }))
    const repository = new DeviceCommandRepositoryMysql()

    const result = await repository.requeueStaleInFlight({
      accessPointId,
      sentBefore: DateTime.utc().minus({ minutes: 5 }),
      now: DateTime.utc(),
    })

    assert.equal(result.requeued, 1)
    const fresco = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(command.deviceCommandId),
      'verificacion'
    )
    assert.equal(fresco.deviceCommandStatus, DEVICE_COMMAND_STATUS.PENDING)
    assert.equal(fresco.deviceCommandAttempts, 1)
    assert.isNull(fresco.deviceCommandSentAt, 'vuelve a la cola limpio, como si no hubiera salido')
  })

  /** El que acaba de salir todavia puede estar acusandose: no se le toca. */
  test('uno recien enviado no se rescata', async ({ assert }) => {
    const command = await enVuelo(DateTime.utc().minus({ seconds: 30 }))
    const repository = new DeviceCommandRepositoryMysql()

    await repository.requeueStaleInFlight({
      accessPointId,
      sentBefore: DateTime.utc().minus({ minutes: 5 }),
      now: DateTime.utc(),
    })

    const fresco = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(command.deviceCommandId),
      'verificacion'
    )
    assert.equal(fresco.deviceCommandStatus, DEVICE_COMMAND_STATUS.SENT)
  })

  /** Una orden que el equipo no puede ejecutar no se reintenta para siempre. */
  test('al agotar los intentos queda fallido, no reencolado', async ({ assert }) => {
    const command = await enVuelo(DateTime.utc().minus({ minutes: 10 }), 2, 3)
    const repository = new DeviceCommandRepositoryMysql()

    const result = await repository.requeueStaleInFlight({
      accessPointId,
      sentBefore: DateTime.utc().minus({ minutes: 5 }),
      now: DateTime.utc(),
    })

    assert.equal(result.failed, 1)
    assert.equal(result.requeued, 0)
    const fresco = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(command.deviceCommandId),
      'verificacion'
    )
    assert.equal(fresco.deviceCommandStatus, DEVICE_COMMAND_STATUS.FAILED)
    assert.isNotNull(fresco.deviceCommandLastError)
  })

  /**
   * `null` en el maximo es "insiste siempre": lo usa la baja de usuario, donde
   * rendirse deja a alguien con acceso que ya no le toca.
   */
  test('sin tope de intentos se reencola por muchas veces que lleve', async ({ assert }) => {
    const command = await enVuelo(DateTime.utc().minus({ minutes: 10 }), 99, null)
    const repository = new DeviceCommandRepositoryMysql()

    await repository.requeueStaleInFlight({
      accessPointId,
      sentBefore: DateTime.utc().minus({ minutes: 5 }),
      now: DateTime.utc(),
    })

    const fresco = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(command.deviceCommandId),
      'verificacion'
    )
    assert.equal(fresco.deviceCommandStatus, DEVICE_COMMAND_STATUS.PENDING)
    assert.equal(fresco.deviceCommandAttempts, 100)
  })
})
