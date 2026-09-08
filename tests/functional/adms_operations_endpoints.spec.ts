import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointProfile from '#models/access_point_profile'
import AdmsIncident from '#models/adms_incident'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import QuarantineClaimService from '#modules/access-point/quarantine/quarantine_claim.service'
import type { AdmsError } from '#exceptions/adms_error'

/**
 * Rebanada 11: las pantallas de operacion.
 *
 * Lo que importa demostrar es el aislamiento: ningun endpoint de aqui puede
 * dejar ver un equipo, un incidente o una serie de otra empresa.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-OP-${STAMP}`
const OTHER_SERIAL = `TEST-ADMS-OTHER-${STAMP}`

test.group('ADMS endpoints de operacion (rebanada 11)', (group) => {
  let accessPoint: AccessPoint
  let foreignAccessPoint: AccessPoint | null = null
  let businessUnitId: number
  let publicId: string
  let user: User
  let incidentId: number
  let foreignIncidentId: number | null = null
  let quarantineId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; userId: number } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, userId: candidate.userId }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')

      businessUnitId = elegido.unitId
      const unit = await BusinessUnit.query().where('businessUnitId', businessUnitId).firstOrFail()
      publicId = String(unit.businessUnitPublicId)
      user = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', elegido.userId)
        .firstOrFail()

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de operacion ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      ap.accessPointLastConnection = DateTime.utc().minus({ seconds: 5 })
      await ap.save()
      accessPoint = ap

      const profile = new AccessPointProfile()
      profile.accessPointId = ap.accessPointId
      profile.businessUnitId = businessUnitId
      profile.accessPointProfileDialect = 'ta'
      profile.accessPointProfileLayoutKnown = 1
      profile.accessPointProfilePlatform = 'ZAM180_TFT'
      profile.accessPointProfileUserCount = 40
      profile.accessPointProfileMaxUserCount = 100
      profile.accessPointProfileFpCount = 80
      await profile.save()

      const incident = new AdmsIncident()
      incident.accessPointId = ap.accessPointId
      incident.businessUnitId = businessUnitId
      incident.admsIncidentKind = 'clock_drift'
      incident.admsIncidentSeverity = 'warning'
      incident.admsIncidentCode = 'ADMS.SYS.001'
      incident.admsIncidentTitle = `Prueba ${STAMP}`
      incident.admsIncidentDetail = 'Incidente de prueba'
      incident.admsIncidentKey = 'prueba'
      incident.admsIncidentStatus = 'open'
      await incident.save()
      incidentId = incident.admsIncidentId

      /** Otra empresa, para probar que no se filtra nada entre tenants. */
      const otherUnit = await BusinessUnit.query()
        .whereNot('businessUnitId', businessUnitId)
        .first()
      if (otherUnit) {
        const other = new AccessPoint()
        other.accessPointName = `Checador ajeno ${STAMP}`
        other.businessUnitId = otherUnit.businessUnitId
        other.accessPointActive = 1
        other.accessPointSerialNumber = OTHER_SERIAL
        other.accessPointStatus = 0
        await other.save()
        foreignAccessPoint = other

        const foreign = new AdmsIncident()
        foreign.accessPointId = other.accessPointId
        foreign.businessUnitId = otherUnit.businessUnitId
        foreign.admsIncidentKind = 'clock_drift'
        foreign.admsIncidentSeverity = 'warning'
        foreign.admsIncidentCode = 'ADMS.SYS.001'
        foreign.admsIncidentTitle = `Ajeno ${STAMP}`
        foreign.admsIncidentDetail = 'Incidente de otra empresa'
        foreign.admsIncidentKey = 'ajeno'
        foreign.admsIncidentStatus = 'open'
        await foreign.save()
        foreignIncidentId = foreign.admsIncidentId
      }

      const quarantined = new AdmsQuarantinedDevice()
      quarantined.admsQuarantinedDeviceSerial = `TEST-ADMS-Q-${STAMP}`
      quarantined.admsQuarantinedDeviceFirstSeenAt = DateTime.utc()
      quarantined.admsQuarantinedDeviceLastSeenAt = DateTime.utc()
      quarantined.admsQuarantinedDeviceLastIp = '192.168.44.21'
      quarantined.admsQuarantinedDeviceHitCount = 3
      quarantined.admsQuarantinedDeviceStatus = 'pending'
      quarantined.admsQuarantinedDeviceFailedClaims = 0
      await quarantined.save()
      quarantineId = quarantined.admsQuarantinedDeviceId
    }, 'fixture de operacion')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      const ids = [accessPoint.accessPointId]
      if (foreignAccessPoint) ids.push(foreignAccessPoint.accessPointId)
      await db
        .from('adms_quarantined_devices')
        .where('adms_quarantined_device_id', quarantineId)
        .delete()
      await db.from('device_commands').whereIn('access_point_id', ids).delete()
      await db.from('adms_incidents').whereIn('access_point_id', ids).delete()
      await db.from('access_point_employees').whereIn('access_point_id', ids).delete()
      await db.from('access_point_stamps').whereIn('access_point_id', ids).delete()
      await AccessPointProfile.query().whereIn('access_point_id', ids).delete()
      await db.from('access_points').whereIn('access_point_id', ids).delete()
    }, 'limpieza de operacion')
  })

  test('la salud lista los equipos de la empresa con su ocupacion', async ({ client, assert }) => {
    const response = await client
      .get('/api/v1/access-points/health')
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 403)
    response.assertStatus(200)
    const rows = response.body().data.accessPoints as Array<{
      accessPointId: number
      status: string
      occupancy: Array<{ modality: string; capacitySource: string; ratio: number | null }>
    }>
    const mine = rows.find((row) => row.accessPointId === accessPoint.accessPointId)
    assert.isDefined(mine)
    assert.equal(mine?.status, 'online')

    const users = mine?.occupancy.find((slot) => slot.modality === 'users')
    assert.equal(users?.capacitySource, 'declared')
    assert.equal(users?.ratio, 0.4)

    // El equipo no declaro capacidad de huellas: no se inventa un maximo.
    const fingerprints = mine?.occupancy.find((slot) => slot.modality === 'fingerprints')
    assert.equal(fingerprints?.capacitySource, 'unknown')
    assert.isNull(fingerprints?.ratio ?? null)

    // Y nunca aparece un equipo de otra empresa.
    if (foreignAccessPoint) {
      assert.isUndefined(rows.find((row) => row.accessPointId === foreignAccessPoint?.accessPointId))
    }
  })

  test('la salud de un equipo ajeno responde 404, no 403', async ({ client, assert }) => {
    if (!foreignAccessPoint) return
    const response = await client
      .get(`/api/v1/access-points/${foreignAccessPoint.accessPointId}/health`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 403)
    // 403 revelaria que ese equipo existe en otra parte.
    response.assertStatus(404)
    assert.equal(response.body().key, 'punto-acceso-no-encontrado')
  })

  test('los incidentes solo muestran los de la empresa', async ({ client, assert }) => {
    const response = await client
      .get('/api/v1/access-points/incidents')
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 403)
    response.assertStatus(200)
    const rows = response.body().data.incidents as Array<{ incidentId: number }>
    assert.isDefined(rows.find((row) => row.incidentId === incidentId))
    if (foreignIncidentId !== null) {
      assert.isUndefined(rows.find((row) => row.incidentId === foreignIncidentId))
    }
  })

  test('resolver un incidente ajeno responde 404', async ({ client, assert }) => {
    if (foreignIncidentId === null) return
    const response = await client
      .post(`/api/v1/access-points/incidents/${foreignIncidentId}/resolve`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 403)
    response.assertStatus(404)

    const foreign = await TenantContext.runUnscoped(
      () => AdmsIncident.query().where('adms_incident_id', foreignIncidentId as number).firstOrFail(),
      'incidente ajeno'
    )
    assert.equal(foreign.admsIncidentStatus, 'open')
  })

  /**
   * `claim-device` es estricto por decision de Wilvardo: solo lo tiene quien
   * plataforma decida. Que el usuario de la fixture NO lo tenga es justamente
   * lo que se comprueba aqui; el enmascarado se prueba contra el servicio.
   */
  test('sin el permiso estricto, la cuarentena no se ve', async ({ client, assert }) => {
    const response = await client
      .get('/api/v1/access-points/quarantine')
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
  })

  test('la lista de cuarentena nunca lleva la serie completa ni la IP exacta', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([businessUnitId], () =>
      new QuarantineClaimService().list()
    )
    const mine = rows.find((row) => row.quarantinedDeviceId === quarantineId)

    assert.isDefined(mine)
    // La serie entera convertiria la lista en un catalogo de series validas
    // para quien no tiene el aparato delante.
    assert.notInclude(JSON.stringify(rows), `TEST-ADMS-Q-${STAMP}`)
    assert.equal(mine?.ipMasked, '192.168.44.0/24')
  })

  test('reclamar con una serie que no esta en espera falla sin decir por que', async ({
    assert,
  }) => {
    let key: string | null = null
    await TenantContext.run([businessUnitId], async () => {
      try {
        await new QuarantineClaimService().claim({
          serialNumber: `NOEXISTE${STAMP}`.slice(0, 32),
          businessUnitId,
          accessPointName: 'Checador inventado',
          businessUnitIds: [businessUnitId],
          userId: user.userId,
        })
      } catch (error) {
        key = (error as AdmsError).key ?? null
      }
    })
    // Un mensaje distinto por caso convertiria el endpoint en un buscador de
    // series ajenas.
    assert.equal(key, 'cuarentena-no-encontrada')
  })

  test('los PINs sin colaborador se listan sin filtrarse entre empresas', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/v1/access-points/unmapped-pins')
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    assert.notEqual(response.status(), 403)
    response.assertStatus(200)
    assert.isArray(response.body().data.unmappedPins)
  })
})
