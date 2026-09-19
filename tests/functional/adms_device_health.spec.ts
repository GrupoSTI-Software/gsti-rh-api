import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'
import { TenantContext } from '#utils/tenant_context'
import HealthService from '#modules/access-point/health/health.service'
import ActiveAccessPointService from '#modules/access-point/platform/active_access_point.service'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'

/**
 * Estado de conexion de una unidad, para la ficha del panel.
 *
 * Un equipo caido son checadas que nadie esta registrando. Lo que hay que
 * demostrar es que el estado sale del latido real y que la ficha distingue
 * "nunca llamo" --que casi siempre es red o configuracion-- de "dejo de
 * llamar", que es otra conversacion con el cliente.
 */
const STAMP = `${Date.now()}`
const SERIAL_VIVO = `TESTH${STAMP}`.slice(0, 24)
const SERIAL_MUDO = `TESTQ${STAMP}`.slice(0, 24)
const SERIAL_SIN_ENTREGA = `TESTZ${STAMP}`.slice(0, 24)

test.group('Estado de conexion de una unidad', (group) => {
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
    }, 'fixture del estado de conexion')
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
        await db.from('access_point_profiles').whereIn('access_point_id', accessPointIds).delete()
        await db.from('access_points').whereIn('access_point_id', accessPointIds).delete()
      }
      if (deviceIds.length > 0) {
        await db.from('platform_devices').whereIn('platform_device_id', deviceIds).delete()
      }
    }, 'limpieza del estado de conexion')
  })

  /** Unidad entregada, con su punto de acceso y el latido que se le indique. */
  async function equipoCon(serial: string, lastConnection: DateTime | null): Promise<number> {
    return TenantContext.runUnscoped(async () => {
      const device = await PlatformDevice.create({
        platformDeviceModelId: modelId,
        platformDeviceSerialNumber: serial,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'asignada',
        platformDeviceActive: 1,
      })
      deviceIds.push(device.platformDeviceId)

      const [assignmentId] = await db.table('platform_device_assignments').insert({
        platform_device_id: device.platformDeviceId,
        business_unit_id: tenant.businessUnitId,
        platform_device_assignment_delivered_at: DateTime.utc().toISODate(),
        platform_device_assignment_released_at: null,
        platform_device_assignment_tenure_regime: 'comodato',
        platform_device_assignment_sale_currency: 'MXN',
      })
      assignmentIds.push(Number(assignmentId))

      const point = await TenantContext.run([tenant.businessUnitId], () =>
        AccessPoint.create({
          accessPointName: `Equipo ${serial}`,
          businessUnitId: tenant.businessUnitId,
          platformDeviceId: device.platformDeviceId,
          accessPointSerialNumber: serial,
          accessPointActive: 1,
          accessPointStatus: 1,
          accessPointLastConnection: lastConnection,
        })
      )
      accessPointIds.push(point.accessPointId)

      return device.platformDeviceId
    }, 'alta de equipo de prueba')
  }

  /** Lo que hace el controlador: resolver la unidad y pedir su salud. */
  async function saludDe(platformDeviceId: number) {
    const { accessPoint } = await new ActiveAccessPointService().resolve(platformDeviceId)
    return TenantContext.runUnscoped(
      () => new HealthService().buildFor(accessPoint, DateTime.utc()),
      'prueba del estado de conexion'
    )
  }

  test('un equipo con latido reciente esta en linea', async ({ assert }) => {
    const deviceId = await equipoCon(SERIAL_VIVO, DateTime.utc().minus({ seconds: 5 }))

    const health = await saludDe(deviceId)

    assert.equal(health.status, 'online')
    assert.isNotNull(health.lastSeenAt)
    assert.equal(health.serialNumber, SERIAL_VIVO)
  })

  /** El umbral es de un minuto: el aparato sondea cada pocos segundos. */
  test('un equipo que dejo de reportar aparece caido', async ({ assert }) => {
    const deviceId = await equipoCon(SERIAL_MUDO, DateTime.utc().minus({ minutes: 20 }))

    const health = await saludDe(deviceId)

    assert.equal(health.status, 'offline')
    assert.isNotNull(health.lastSeenAt, 'se sabe cuando fue la ultima vez, que es lo accionable')
  })

  /**
   * `never` no es lo mismo que `offline`: un equipo que nunca llamo casi
   * siempre es red o configuracion, y esa es otra conversacion con el cliente.
   */
  test('un equipo que nunca llamo se distingue del que dejo de llamar', async ({ assert }) => {
    const deviceId = await equipoCon(`${SERIAL_VIVO}N`.slice(0, 24), null)

    const health = await saludDe(deviceId)

    assert.equal(health.status, 'never')
    assert.isNull(health.lastSeenAt)
  })

  test('una unidad sin entrega vigente no tiene estado que mostrar', async ({ assert }) => {
    const device = await TenantContext.runUnscoped(async () => {
      const nueva = await PlatformDevice.create({
        platformDeviceModelId: modelId,
        platformDeviceSerialNumber: SERIAL_SIN_ENTREGA,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'disponible',
        platformDeviceActive: 1,
      })
      deviceIds.push(nueva.platformDeviceId)
      return nueva
    }, 'alta de unidad sin entrega')

    try {
      await saludDe(device.platformDeviceId)
      assert.fail('una unidad en existencias no tiene equipo del que informar')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      const failure = error as PlatformDeviceServiceError
      assert.equal(failure.httpStatus, 422)
      assert.equal(failure.errorCode, PLATFORM_DEVICE_ERROR_CODES.NO_OPEN_ASSIGNMENT)
    }
  })
})
