import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'
import { TenantContext } from '#utils/tenant_context'
import QuarantineInventoryLookupService from '#modules/access-point/platform/quarantine_inventory_lookup.service'

/**
 * Cruce de las series en cuarentena contra el inventario de plataforma.
 *
 * Lo que hay que demostrar: que la pantalla puede distinguir un equipo que
 * GSTI compro y todavia no entrega --se reusa al reclamar, con su origen y su
 * costo-- de un aparato ajeno que entra como `del_cliente`, y que una serie ya
 * entregada nombra a la empresa que la tiene en vez de dejar al operador
 * frente a un 409 sin explicacion.
 */
const STAMP = `${Date.now()}`
const SERIAL_EN_INVENTARIO = `TESTI${STAMP}`.slice(0, 24)
const SERIAL_ENTREGADO = `TESTE${STAMP}`.slice(0, 24)
const SERIAL_DESCONOCIDO = `TESTX${STAMP}`.slice(0, 24)
const SERIAL_MODELO_BORRADO = `TESTM${STAMP}`.slice(0, 24)
const SERIAL_MINUSCULAS = `testk${STAMP}`.slice(0, 24)

test.group('Cruce de cuarentena contra inventario', (group) => {
  let tenant: BusinessUnit
  let modelId: number
  const deviceIds: number[] = []
  const assignmentIds: number[] = []
  const modelIds: number[] = []

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
    }, 'fixture del cruce de inventario')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (assignmentIds.length > 0) {
        await db
          .from('platform_device_assignments')
          .whereIn('platform_device_assignment_id', assignmentIds)
          .delete()
      }
      if (deviceIds.length > 0) {
        await db.from('platform_devices').whereIn('platform_device_id', deviceIds).delete()
      }
      if (modelIds.length > 0) {
        await db.from('platform_device_models').whereIn('platform_device_model_id', modelIds).delete()
      }
    }, 'limpieza del cruce de inventario')
  })

  /** Alta directa en el inventario, sin pasar por el servicio de altas. */
  async function unitOf(
    serial: string,
    stockStatus: 'disponible' | 'asignada'
  ): Promise<PlatformDevice> {
    const device = await PlatformDevice.create({
      platformDeviceModelId: modelId,
      platformDeviceSerialNumber: serial,
      platformDeviceOrigin: 'propia',
      platformDeviceStockStatus: stockStatus,
      platformDeviceActive: 1,
    })
    deviceIds.push(device.platformDeviceId)
    return device
  }

  test('una serie del inventario trae su unidad, su modelo y su estado', async ({ assert }) => {
    const device = await unitOf(SERIAL_EN_INVENTARIO, 'disponible')

    const found = await new QuarantineInventoryLookupService().findBySerials([
      SERIAL_EN_INVENTARIO,
    ])

    const unit = found.get(SERIAL_EN_INVENTARIO)
    assert.isDefined(unit, 'la serie comprada tiene que cruzar contra el inventario')
    assert.equal(unit!.platformDeviceId, device.platformDeviceId)
    assert.equal(unit!.modelId, modelId)
    assert.equal(unit!.origin, 'propia')
    assert.equal(unit!.stockStatus, 'disponible')
    assert.isNull(unit!.assignedTenantName, 'sin entrega abierta no hay empresa que nombrar')
    assert.isNotEmpty(unit!.modelName)
    assert.isNotEmpty(unit!.modelBrand)
  })

  test('una serie que nadie compro no aparece en el cruce', async ({ assert }) => {
    const found = await new QuarantineInventoryLookupService().findBySerials([
      SERIAL_DESCONOCIDO,
    ])

    assert.isFalse(
      found.has(SERIAL_DESCONOCIDO),
      'un aparato ajeno no puede figurar como unidad del inventario'
    )
  })

  test('una serie ya entregada nombra a la empresa que la tiene', async ({ assert }) => {
    const device = await unitOf(SERIAL_ENTREGADO, 'asignada')
    const [assignmentId] = await db
      .table('platform_device_assignments')
      .insert({
        platform_device_id: device.platformDeviceId,
        business_unit_id: tenant.businessUnitId,
        platform_device_assignment_delivered_at: DateTime.utc().toISODate(),
        platform_device_assignment_released_at: null,
        platform_device_assignment_tenure_regime: 'comodato',
        platform_device_assignment_sale_currency: 'MXN',
      })
    assignmentIds.push(Number(assignmentId))

    const found = await new QuarantineInventoryLookupService().findBySerials([SERIAL_ENTREGADO])

    const unit = found.get(SERIAL_ENTREGADO)
    assert.isDefined(unit)
    assert.equal(unit!.stockStatus, 'asignada')
    assert.equal(
      unit!.assignedTenantName,
      tenant.businessUnitName,
      'el 409 del reclamo tiene que poder decir a quien esta entregada'
    )
  })

  test('un modelo dado de baja no tumba la lista entera', async ({ assert }) => {
    /**
     * El catalogo da de baja modelos sin mirar si alguna unidad los usa. Si el
     * cruce no los precarga con `withTrashed`, Lucid deja la relacion en null
     * y el acceso al nombre revienta la respuesta completa -- las 300 filas,
     * no solo la afectada.
     */
    const modelo = await TenantContext.runUnscoped(async () => {
      const nuevo = await PlatformDeviceModel.create({
        platformDeviceModelBrand: 'ZKTeco',
        platformDeviceModelName: `Retirado ${STAMP}`,
        platformDeviceModelSlug: `retirado-${STAMP}`,
        platformDeviceModelStatus: 'vigente',
        platformDeviceModelActive: 1,
      })
      modelIds.push(nuevo.platformDeviceModelId)
      return nuevo
    }, 'alta de modelo de prueba')

    const device = await TenantContext.runUnscoped(async () => {
      const nuevo = await PlatformDevice.create({
        platformDeviceModelId: modelo.platformDeviceModelId,
        platformDeviceSerialNumber: SERIAL_MODELO_BORRADO,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'disponible',
        platformDeviceActive: 1,
      })
      deviceIds.push(nuevo.platformDeviceId)
      return nuevo
    }, 'alta de unidad con modelo que se borrara')

    await TenantContext.runUnscoped(
      () =>
        db
          .from('platform_device_models')
          .where('platform_device_model_id', modelo.platformDeviceModelId)
          .update({ platform_device_model_deleted_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss') }),
      'dar de baja el modelo de prueba'
    )

    const found = await new QuarantineInventoryLookupService().findBySerials([
      SERIAL_MODELO_BORRADO,
      SERIAL_EN_INVENTARIO,
    ])

    const unit = found.get(SERIAL_MODELO_BORRADO)
    assert.isDefined(unit, 'la unidad sigue existiendo aunque su modelo ya no se ofrezca')
    assert.equal(unit!.platformDeviceId, device.platformDeviceId)
    assert.equal(
      unit!.modelName,
      `Retirado ${STAMP}`,
      'el operador necesita saber que aparato es, aunque el catalogo lo haya retirado'
    )
  })

  test('la serie cruza sin importar mayusculas ni espacios', async ({ assert }) => {
    await TenantContext.runUnscoped(async () => {
      const nuevo = await PlatformDevice.create({
        platformDeviceModelId: modelId,
        platformDeviceSerialNumber: SERIAL_MINUSCULAS,
        platformDeviceOrigin: 'propia',
        platformDeviceStockStatus: 'disponible',
        platformDeviceActive: 1,
      })
      deviceIds.push(nuevo.platformDeviceId)
    }, 'alta de unidad con serie en minusculas')

    const found = await new QuarantineInventoryLookupService().findBySerials([SERIAL_MINUSCULAS])

    assert.isTrue(
      found.has(SERIAL_MINUSCULAS.toUpperCase()),
      'la serie del inventario la teclea un humano y la del canal la manda el aparato: es el mismo equipo'
    )
  })

  test('sin series no hay consulta ni resultado', async ({ assert }) => {
    const found = await new QuarantineInventoryLookupService().findBySerials([])

    assert.equal(found.size, 0)
  })
})
