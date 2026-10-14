import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'
import { TenantContext } from '#utils/tenant_context'
import AccessPointRecreateService from '#modules/access-point/platform/access_point_recreate.service'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'

/**
 * Recrear desde el panel el punto de acceso que la empresa borro.
 *
 * El caso que lo motiva: la empresa borra el checador desde el Backoffice y la
 * unidad queda entregada pero sin direccion ni estado. El borrado es logico y
 * el indice de la serie no lo distingue, asi que crear uno nuevo chocaba.
 */
const STAMP = `${Date.now()}`
const SERIAL_AUSENTE = `TESTR${STAMP}`.slice(0, 24)
const SERIAL_BORRADO = `TESTB${STAMP}`.slice(0, 24)
const SERIAL_VIVO = `TESTV${STAMP}`.slice(0, 24)
const SERIAL_SIN_ENTREGA = `TESTS${STAMP}`.slice(0, 24)
const SERIALES = [SERIAL_AUSENTE, SERIAL_BORRADO, SERIAL_VIVO, SERIAL_SIN_ENTREGA]

test.group('Recrear el punto de acceso de una unidad', (group) => {
  let tenant: BusinessUnit
  let modelId: number
  const deviceIds: number[] = []
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
    }, 'fixture de recrear punto de acceso')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (assignmentIds.length > 0) {
        await db
          .from('platform_device_assignments')
          .whereIn('platform_device_assignment_id', assignmentIds)
          .delete()
      }
      await db.from('access_points').whereIn('access_point_serial_number', SERIALES).delete()
      if (deviceIds.length > 0) {
        await db.from('platform_devices').whereIn('platform_device_id', deviceIds).delete()
      }
    }, 'limpieza de recrear punto de acceso')
  })

  async function deliveredUnit(serial: string, delivered = true): Promise<PlatformDevice> {
    return TenantContext.runUnscoped(async () => {
      const device = await PlatformDevice.create({
        platformDeviceModelId: modelId,
        platformDeviceSerialNumber: serial,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: delivered ? 'asignada' : 'disponible',
        platformDeviceActive: 1,
      })
      deviceIds.push(device.platformDeviceId)
      if (delivered) {
        const [assignmentId] = await db.table('platform_device_assignments').insert({
          platform_device_id: device.platformDeviceId,
          business_unit_id: tenant.businessUnitId,
          platform_device_assignment_delivered_at: DateTime.utc().toISODate(),
          platform_device_assignment_released_at: null,
          platform_device_assignment_tenure_regime: 'comodato',
          platform_device_assignment_sale_currency: 'MXN',
        })
        assignmentIds.push(Number(assignmentId))
      }
      return device
    }, 'alta de unidad de prueba')
  }

  async function accessPointOf(device: PlatformDevice): Promise<AccessPoint> {
    return TenantContext.run([tenant.businessUnitId], () =>
      AccessPoint.create({
        accessPointName: `Entrada de prueba ${STAMP}`,
        businessUnitId: tenant.businessUnitId,
        platformDeviceId: device.platformDeviceId,
        accessPointSerialNumber: device.platformDeviceSerialNumber,
        accessPointActive: 1,
        accessPointStatus: 1,
      })
    )
  }

  test('sin punto de acceso, lo crea con su direccion del canal', async ({ assert }) => {
    const device = await deliveredUnit(SERIAL_AUSENTE)

    const result = await new AccessPointRecreateService().recreate(device.platformDeviceId)

    assert.equal(result.outcome, 'created')
    const point = await TenantContext.runUnscoped(
      () => AccessPoint.findOrFail(result.accessPoint.accessPointId),
      'lectura de prueba'
    )
    assert.equal(point.businessUnitId, tenant.businessUnitId)
    assert.equal(point.platformDeviceId, device.platformDeviceId)
    assert.isNotNull(point.accessPointChannelSecret)
  })

  test('si la empresa lo borro, revive el mismo renglon y su direccion', async ({ assert }) => {
    const device = await deliveredUnit(SERIAL_BORRADO)
    const point = await accessPointOf(device)
    const secret = point.accessPointChannelSecret
    await TenantContext.runUnscoped(async () => {
      point.deletedAt = DateTime.utc()
      point.accessPointActive = 0
      await point.save()
    }, 'borrado logico de prueba')

    const result = await new AccessPointRecreateService().recreate(device.platformDeviceId)

    assert.equal(result.outcome, 'restored')
    assert.equal(result.accessPoint.accessPointId, point.accessPointId)
    await TenantContext.runUnscoped(() => point.refresh(), 'lectura de prueba')
    assert.isNull(point.deletedAt)
    assert.equal(point.accessPointActive, 1)
    assert.equal(point.accessPointChannelSecret, secret, 'la direccion tecleada en el aparato sigue sirviendo')
  })

  test('si el punto sigue vivo, lo adopta sin duplicar', async ({ assert }) => {
    const device = await deliveredUnit(SERIAL_VIVO)
    const point = await accessPointOf(device)

    const result = await new AccessPointRecreateService().recreate(device.platformDeviceId)

    assert.equal(result.outcome, 'adopted')
    assert.equal(result.accessPoint.accessPointId, point.accessPointId)
  })

  test('una unidad sin entrega vigente no tiene empresa a quien crearselo', async ({
    assert,
  }) => {
    const device = await deliveredUnit(SERIAL_SIN_ENTREGA, false)

    try {
      await new AccessPointRecreateService().recreate(device.platformDeviceId)
      assert.fail('debio rechazar la unidad sin entrega')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      assert.equal(
        (error as PlatformDeviceServiceError).errorCode,
        PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT
      )
    }
  })
})
