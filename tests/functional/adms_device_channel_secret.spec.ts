import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'
import { TenantContext } from '#utils/tenant_context'
import DeviceChannelSecretService from '#modules/access-point/platform/device_channel_secret.service'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'

/**
 * Consulta de la direccion propia del equipo.
 *
 * El secreto se guarda cifrado y sin hashear justamente para que el operador
 * pueda volver a teclearlo cuando alguien resetee un aparato. Hasta ahora solo
 * salia en la respuesta del reclamo, una sola vez: un equipo entregado por la
 * via normal del inventario nacia con su direccion y nadie podia verla nunca.
 */
const STAMP = `${Date.now()}`
const SERIAL_ENTREGADO = `TESTC${STAMP}`.slice(0, 24)
const SERIAL_SIN_ENTREGA = `TESTN${STAMP}`.slice(0, 24)
const SERIAL_LEGADO = `TESTL${STAMP}`.slice(0, 24)
const SERIAL_DEVUELTO = `TESTD${STAMP}`.slice(0, 24)
const SERIAL_DESACTIVADO = `TESTA${STAMP}`.slice(0, 24)

test.group('Direccion del canal de una unidad', (group) => {
  let tenant: BusinessUnit
  let modelId: number
  const deviceIds: number[] = []
  const accessPointIds: number[] = []
  const assignmentIds: number[] = []

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query().whereNull('business_unit_deleted_at').first()
      if (!unit) throw new Error('Se requiere al menos una empresa.')
      tenant = unit

      const model = await PlatformDeviceModel.query()
        .where('platform_device_model_status', 'vigente')
        .whereNull('platform_device_model_deleted_at')
        .first()
      if (!model) throw new Error('Se requiere un modelo de dispositivo vigente.')
      modelId = model.platformDeviceModelId
    }, 'fixture de la direccion del canal')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (assignmentIds.length > 0) {
        await db
          .from('platform_device_assignments')
          .whereIn('platform_device_assignment_id', assignmentIds)
          .delete()
      }
      if (accessPointIds.length > 0) {
        await db.from('access_points').whereIn('access_point_id', accessPointIds).delete()
      }
      if (deviceIds.length > 0) {
        await db.from('platform_devices').whereIn('platform_device_id', deviceIds).delete()
      }
    }, 'limpieza de la direccion del canal')
  })

  async function unitOf(serial: string): Promise<PlatformDevice> {
    return TenantContext.runUnscoped(async () => {
      const device = await PlatformDevice.create({
        platformDeviceModelId: modelId,
        platformDeviceSerialNumber: serial,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'asignada',
        platformDeviceActive: 1,
      })
      deviceIds.push(device.platformDeviceId)
      return device
    }, 'alta de unidad de prueba')
  }

  /** Entrega abierta de la unidad, como la deja `createAssignment`. */
  async function openAssignmentOf(device: PlatformDevice): Promise<void> {
    await TenantContext.runUnscoped(async () => {
      const [assignmentId] = await db.table('platform_device_assignments').insert({
        platform_device_id: device.platformDeviceId,
        business_unit_id: tenant.businessUnitId,
        platform_device_assignment_delivered_at: DateTime.utc().toISODate(),
        platform_device_assignment_released_at: null,
        platform_device_assignment_tenure_regime: 'comodato',
        platform_device_assignment_sale_currency: 'MXN',
      })
      assignmentIds.push(Number(assignmentId))
    }, 'alta de entrega de prueba')
  }

  /** Punto de acceso amarrado a la unidad, como lo deja la precarga al entregar. */
  async function accessPointOf(device: PlatformDevice, name: string): Promise<AccessPoint> {
    return TenantContext.run([tenant.businessUnitId], async () => {
      const point = await AccessPoint.create({
        accessPointName: name,
        businessUnitId: tenant.businessUnitId,
        platformDeviceId: device.platformDeviceId,
        accessPointSerialNumber: device.platformDeviceSerialNumber,
        accessPointActive: 1,
        accessPointStatus: 1,
      })
      accessPointIds.push(point.accessPointId)
      return point
    })
  }

  test('una unidad entregada devuelve su direccion y su empresa', async ({ assert }) => {
    const device = await unitOf(SERIAL_ENTREGADO)
    await openAssignmentOf(device)
    const point = await accessPointOf(device, `Entrada de prueba ${STAMP}`)

    const address = await new DeviceChannelSecretService().show(device.platformDeviceId)

    assert.equal(address.accessPointId, point.accessPointId)
    assert.equal(address.serialNumber, SERIAL_ENTREGADO)
    assert.equal(address.businessUnitId, tenant.businessUnitId)
    assert.equal(address.businessUnitName, tenant.businessUnitName)
    assert.isTrue(address.hasSecret, 'todo punto de acceso nace con su direccion propia')
    assert.isNotNull(address.secret)
    assert.isNotEmpty(address.secret!)
  })

  test('la direccion es la misma en dos consultas: leer no rota', async ({ assert }) => {
    const device = await unitOf(`${SERIAL_ENTREGADO}B`.slice(0, 24))
    await openAssignmentOf(device)
    await accessPointOf(device, `Entrada estable ${STAMP}`)

    const service = new DeviceChannelSecretService()
    const primera = await service.show(device.platformDeviceId)
    const segunda = await service.show(device.platformDeviceId)

    assert.equal(
      primera.secret,
      segunda.secret,
      'consultar la direccion no puede cambiarla: el aparato ya la tiene tecleada'
    )
  })

  test('un equipo anterior al canal se distingue de uno sin direccion por error', async ({
    assert,
  }) => {
    const device = await unitOf(SERIAL_LEGADO)
    await openAssignmentOf(device)
    const point = await accessPointOf(device, `Entrada legada ${STAMP}`)
    await TenantContext.runUnscoped(
      () =>
        db
          .from('access_points')
          .where('access_point_id', point.accessPointId)
          .update({ access_point_channel_secret: null, access_point_channel_secret_set_at: null }),
      'simular equipo anterior al canal'
    )

    const address = await new DeviceChannelSecretService().show(device.platformDeviceId)

    assert.isFalse(address.hasSecret, 'el legado en convivencia no tiene direccion que teclear')
    assert.isNull(address.secret)
  })

  test('una unidad sin entrega vigente responde 422, no una direccion vacia', async ({
    assert,
  }) => {
    const device = await unitOf(SERIAL_SIN_ENTREGA)

    try {
      await new DeviceChannelSecretService().show(device.platformDeviceId)
      assert.fail('una unidad sin entrega no puede devolver direccion')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      const failure = error as PlatformDeviceServiceError
      assert.equal(failure.httpStatus, 422)
      assert.equal(failure.errorCode, PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT)
    }
  })

  test('una entrega ya cerrada no revela la direccion ni el nombre del ex cliente', async ({
    assert,
  }) => {
    const device = await unitOf(SERIAL_DEVUELTO)
    await openAssignmentOf(device)
    const point = await accessPointOf(device, `Entrada devuelta ${STAMP}`)

    /**
     * Cerrar la entrega desactiva el punto de acceso pero NO lo borra: es la
     * regla del inventario. Si el endpoint se guiara por el amarre historico,
     * seguiria entregando la direccion de un cliente que ya devolvio el equipo.
     */
    await TenantContext.runUnscoped(async () => {
      await db
        .from('platform_device_assignments')
        .whereIn('platform_device_assignment_id', assignmentIds)
        .where('platform_device_id', device.platformDeviceId)
        .update({ platform_device_assignment_released_at: DateTime.utc().toISODate() })
      await db
        .from('access_points')
        .where('access_point_id', point.accessPointId)
        .update({ access_point_active: 0 })
    }, 'cerrar la entrega de prueba')

    try {
      await new DeviceChannelSecretService().show(device.platformDeviceId)
      assert.fail('una unidad devuelta no puede seguir entregando su direccion')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      const failure = error as PlatformDeviceServiceError
      assert.equal(failure.errorCode, PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT)
    }
  })

  test('un punto de acceso desactivado con entrega abierta si devuelve su direccion', async ({
    assert,
  }) => {
    const device = await unitOf(SERIAL_DESACTIVADO)
    await openAssignmentOf(device)
    const point = await accessPointOf(device, `Entrada desactivada ${STAMP}`)
    await TenantContext.runUnscoped(
      () =>
        db
          .from('access_points')
          .where('access_point_id', point.accessPointId)
          .update({ access_point_active: 0 }),
      'desactivar el punto de acceso de prueba'
    )

    const address = await new DeviceChannelSecretService().show(device.platformDeviceId)

    assert.isTrue(
      address.hasSecret,
      'la adopcion idempotente no reactiva la fila: exigir active=1 dejaria sin direccion a equipos entregados'
    )
  })

  test('una unidad que no existe responde 404', async ({ assert }) => {
    try {
      await new DeviceChannelSecretService().show(2147483000)
      assert.fail('una unidad inexistente no puede devolver direccion')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      const failure = error as PlatformDeviceServiceError
      assert.equal(failure.httpStatus, 404)
      assert.equal(failure.errorCode, PLATFORM_DEVICE_ERROR_CODES.DEVICE_NOT_FOUND)
    }
  })
})
