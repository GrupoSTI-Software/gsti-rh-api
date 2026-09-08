import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'
import { TenantContext } from '#utils/tenant_context'
import PlatformQuarantineClaimService from '#modules/access-point/platform/quarantine_claim.service'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'

/**
 * Reclamo de un checador desde el panel de plataforma.
 *
 * El cliente nunca registra sus dispositivos: avisa que ya tiene el aparato, lo
 * conecta, cae en cuarentena, y desde landlord se le asigna. Lo que hay que
 * demostrar es que queda como propiedad del CLIENTE y no como stock de GSTI, y
 * que el ciclo cierra: unidad, entrega, punto de acceso y cuarentena.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TESTQ${STAMP}`.slice(0, 24)
const SERIAL_REVIVE = `TESTR${STAMP}`.slice(0, 24)

test.group('Reclamo de cuarentena desde plataforma', (group) => {
  let tenant: BusinessUnit
  let modelId: number
  let biometricsWasEnabled = false
  const quarantineIds: number[] = []
  const deviceIds: number[] = []
  const accessPointIds: number[] = []

  async function quarantineOf(serial: string): Promise<AdmsQuarantinedDevice> {
    return TenantContext.runUnscoped(async () => {
      const row = new AdmsQuarantinedDevice()
      row.admsQuarantinedDeviceSerial = serial
      row.admsQuarantinedDeviceFirstSeenAt = DateTime.utc()
      row.admsQuarantinedDeviceLastSeenAt = DateTime.utc()
      row.admsQuarantinedDeviceLastIp = '189.203.101.229'
      row.admsQuarantinedDeviceHitCount = 12
      row.admsQuarantinedDeviceStatus = 'pending'
      row.admsQuarantinedDeviceFailedClaims = 0
      await row.save()
      quarantineIds.push(row.admsQuarantinedDeviceId)
      return row
    }, 'fixture de cuarentena')
  }

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const unit = await BusinessUnit.query().whereNull('business_unit_deleted_at').first()
      if (!unit) throw new Error('Se requiere al menos una empresa.')
      tenant = unit

      /**
       * `createAssignment` exige la bandera de biometricos (RN7). Se habilita
       * para la prueba y se restaura en la limpieza: si la base de desarrollo
       * no tiene ninguna empresa con la bandera, la prueba no puede correr.
       */
      biometricsWasEnabled = unit.businessUnitHasBiometrics === 1
      if (!biometricsWasEnabled) {
        unit.businessUnitHasBiometrics = 1
        await unit.save()
      }

      const model = await PlatformDeviceModel.query()
        .where('platform_device_model_status', 'vigente')
        .whereNull('platform_device_model_deleted_at')
        .first()
      if (!model) throw new Error('Se requiere un modelo de dispositivo vigente.')
      modelId = model.platformDeviceModelId
    }, 'fixture del reclamo')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (accessPointIds.length > 0) {
        await db.from('access_points').whereIn('access_point_id', accessPointIds).delete()
      }
      if (deviceIds.length > 0) {
        await db.from('platform_device_assignments').whereIn('platform_device_id', deviceIds).delete()
        await db.from('platform_devices').whereIn('platform_device_id', deviceIds).delete()
      }
      if (!biometricsWasEnabled && tenant) {
        tenant.businessUnitHasBiometrics = 0
        await tenant.save()
      }
      if (quarantineIds.length > 0) {
        await db
          .from('adms_quarantined_devices')
          .whereIn('adms_quarantined_device_id', quarantineIds)
          .delete()
      }
    }, 'limpieza del reclamo')
  })

  test('reclamar cierra el ciclo: unidad, entrega, punto de acceso y cuarentena', async ({
    assert,
  }) => {
    const row = await quarantineOf(SERIAL)
    const service = new PlatformQuarantineClaimService()
    const result = await service.claim({
      quarantinedDeviceId: row.admsQuarantinedDeviceId,
      tenantPublicId: String(tenant.businessUnitPublicId),
      platformDeviceModelId: modelId,
      deliveredAt: new Date(),
      createdByUserId: null,
    })
    deviceIds.push(result.platformDeviceId)
    accessPointIds.push(result.accessPointId)

    assert.equal(result.serialNumber, SERIAL)
    assert.isAbove(result.accessPointId, 0)

    const device = await TenantContext.runUnscoped(
      () =>
        PlatformDevice.query().where('platform_device_id', result.platformDeviceId).firstOrFail(),
      'unidad creada'
    )
    // Lo que lo distingue del stock de GSTI: es del cliente, sin costo.
    assert.equal(device.platformDeviceOrigin, 'del_cliente')
    assert.equal(device.platformDeviceStockStatus, 'asignada')
    assert.isNull(device.platformDeviceAcquisitionCostCents)

    const accessPoint = await TenantContext.runUnscoped(
      () => AccessPoint.query().where('access_point_id', result.accessPointId).firstOrFail(),
      'punto de acceso creado'
    )
    assert.equal(accessPoint.businessUnitId, tenant.businessUnitId)
    assert.equal(accessPoint.accessPointSerialNumber, SERIAL)
    assert.equal(accessPoint.accessPointActive, 1)
    // El amarre con el inventario: sin el, el tablero de discrepancias no puede
    // emparejar los dos planos.
    assert.equal(accessPoint.platformDeviceId, result.platformDeviceId)

    const releida = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', row.admsQuarantinedDeviceId)
          .firstOrFail(),
      'cuarentena cerrada'
    )
    assert.equal(releida.admsQuarantinedDeviceStatus, 'claimed')
    assert.equal(releida.claimedBusinessUnitId, tenant.businessUnitId)
    assert.equal(releida.claimedAccessPointId, result.accessPointId)
  })

  test('reclamar dos veces la misma fila no crea una segunda unidad', async ({ assert }) => {
    const row = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_serial', SERIAL)
          .firstOrFail(),
      'cuarentena ya reclamada'
    )
    const service = new PlatformQuarantineClaimService()
    try {
      await service.claim({
        quarantinedDeviceId: row.admsQuarantinedDeviceId,
        tenantPublicId: String(tenant.businessUnitPublicId),
        platformDeviceModelId: modelId,
        deliveredAt: new Date(),
        createdByUserId: null,
      })
      assert.fail('debio rechazar el segundo reclamo')
    } catch (error) {
      assert.instanceOf(error, PlatformDeviceServiceError)
      assert.equal((error as PlatformDeviceServiceError).httpStatus, 409)
    }
  })

  /**
   * El caso que rompia antes: el cliente borro el punto de acceso desde su
   * backoffice. El borrado NO anula la serie y la UNIQUE es de una sola
   * columna, asi que esa serie queda secuestrada por la fila muerta y crear
   * una nueva choca. Se revive en vez de crear.
   */
  test('una serie secuestrada por un punto de acceso dado de baja se revive', async ({
    assert,
  }) => {
    const muerto = await TenantContext.runUnscoped(async () => {
      const ap = new AccessPoint()
      ap.accessPointName = 'Punto de acceso borrado por el cliente'
      ap.businessUnitId = tenant.businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL_REVIVE
      ap.accessPointStatus = 0
      await ap.save()
      accessPointIds.push(ap.accessPointId)
      // Borrado como lo hace el backoffice: sin anular la serie.
      await ap.delete()
      return ap
    }, 'punto de acceso dado de baja')

    const row = await quarantineOf(SERIAL_REVIVE)
    const service = new PlatformQuarantineClaimService()
    const result = await service.claim({
      quarantinedDeviceId: row.admsQuarantinedDeviceId,
      tenantPublicId: String(tenant.businessUnitPublicId),
      platformDeviceModelId: modelId,
      deliveredAt: new Date(),
      createdByUserId: null,
    })
    deviceIds.push(result.platformDeviceId)

    assert.isTrue(result.revivedDeletedAccessPoint)
    // Es la MISMA fila: conserva la explicacion de las checadas que registro.
    assert.equal(result.accessPointId, muerto.accessPointId)
    assert.equal(result.accessPointOutcome, 'adopted')

    const revivido = await TenantContext.runUnscoped(
      () => AccessPoint.query().where('access_point_id', muerto.accessPointId).firstOrFail(),
      'punto de acceso revivido'
    )
    assert.isNull(revivido.deletedAt)
    assert.equal(revivido.platformDeviceId, result.platformDeviceId)
  })

  /**
   * Lo que rompio en el primer uso real. Un intento fallido creaba la unidad y
   * la compensacion la marcaba retirada; como la serie es UNICA en el
   * inventario, esa lapida bloqueaba para siempre los reclamos de ese aparato.
   * Compensar es dejar el mundo como estaba, no dejar un muerto atravesado.
   */
  test('si la asignacion falla, no queda ninguna unidad de esa serie', async ({ assert }) => {
    const serial = `TESTF${STAMP}`.slice(0, 24)
    const row = await quarantineOf(serial)

    /** Se apaga la bandera de biometricos: la asignacion rechaza con 422. */
    tenant.businessUnitHasBiometrics = 0
    await TenantContext.runUnscoped(() => tenant.save(), 'apagar biometricos')

    const service = new PlatformQuarantineClaimService()
    let fallo = false
    try {
      await service.claim({
        quarantinedDeviceId: row.admsQuarantinedDeviceId,
        tenantPublicId: String(tenant.businessUnitPublicId),
        platformDeviceModelId: modelId,
        deliveredAt: new Date(),
        createdByUserId: null,
      })
    } catch {
      fallo = true
    }
    tenant.businessUnitHasBiometrics = 1
    await TenantContext.runUnscoped(() => tenant.save(), 'restaurar biometricos')

    assert.isTrue(fallo, 'la asignacion debia fallar sin la bandera')

    const restos = await TenantContext.runUnscoped(
      () =>
        db
          .from('platform_devices')
          .where('platform_device_serial_number', serial)
          .count('* as total'),
      'restos de la compensacion'
    )
    assert.equal(Number(restos[0].total), 0)

    // Y la cuarentena sigue en espera: se puede volver a intentar.
    const releida = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', row.admsQuarantinedDeviceId)
          .firstOrFail(),
      'cuarentena tras el fallo'
    )
    assert.equal(releida.admsQuarantinedDeviceStatus, 'pending')
  })

  test('una unidad retirada no se reusa, y el error dice el estado real', async ({ assert }) => {
    const serial = `TESTX${STAMP}`.slice(0, 24)
    const retirada = await TenantContext.runUnscoped(async () => {
      const d = new PlatformDevice()
      d.platformDeviceSerialNumber = serial
      d.platformDeviceModelId = modelId
      d.platformDeviceOrigin = 'del_cliente'
      d.platformDeviceStockStatus = 'retirada'
      d.platformDeviceRetireReason = 'danado'
      d.platformDeviceActive = 0
      await d.save()
      deviceIds.push(d.platformDeviceId)
      return d
    }, 'unidad retirada')

    const row = await quarantineOf(serial)
    const service = new PlatformQuarantineClaimService()
    try {
      await service.claim({
        quarantinedDeviceId: row.admsQuarantinedDeviceId,
        tenantPublicId: String(tenant.businessUnitPublicId),
        platformDeviceModelId: modelId,
        deliveredAt: new Date(),
        createdByUserId: null,
      })
      assert.fail('debio rechazar la unidad retirada')
    } catch (error) {
      const e = error as PlatformDeviceServiceError
      assert.equal(e.httpStatus, 409)
      // El mensaje habla del estado real, no de tenants ni fechas.
      assert.include(e.detail ?? '', 'retirada')
    }
    assert.equal(retirada.platformDeviceStockStatus, 'retirada')
  })

  test('una cuarentena que no existe responde 404, no 500', async ({ assert }) => {
    const service = new PlatformQuarantineClaimService()
    try {
      await service.claim({
        quarantinedDeviceId: 999999999,
        tenantPublicId: String(tenant.businessUnitPublicId),
        platformDeviceModelId: modelId,
        deliveredAt: new Date(),
        createdByUserId: null,
      })
      assert.fail('debio lanzar')
    } catch (error) {
      assert.equal((error as PlatformDeviceServiceError).httpStatus, 404)
    }
  })
})
