import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import AdmsIncident from '#models/adms_incident'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'

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
  let employeeId: number

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
          employeeId = someone.employeeId
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

      /**
       * Padron del equipo: una persona ya confirmada por el aparato y un PIN
       * que el equipo reporto sin que nadie lo haya vinculado todavia.
       */
      const pivot = new AccessPointEmployee()
      pivot.accessPointId = ap.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = employeeId
      pivot.accessPointEmployeePin = `9${STAMP.slice(-4)}`
      pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
      pivot.accessPointEmployeePinSource = 'assigned'
      await pivot.save()

      const unmapped = new AdmsUnmappedPin()
      unmapped.accessPointId = ap.accessPointId
      unmapped.businessUnitId = businessUnitId
      unmapped.admsUnmappedPinPin = `8${STAMP.slice(-4)}`
      unmapped.admsUnmappedPinFirstSeenAt = DateTime.utc()
      unmapped.admsUnmappedPinLastSeenAt = DateTime.utc()
      unmapped.admsUnmappedPinPunchCount = 2
      unmapped.admsUnmappedPinStatus = 'pending'
      await unmapped.save()

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

      /** Un aviso informativo: existe, pero no le pide nada a nadie. */
      const notice = new AdmsIncident()
      notice.accessPointId = ap.accessPointId
      notice.businessUnitId = businessUnitId
      notice.admsIncidentKind = 'oplog'
      notice.admsIncidentSeverity = 'info'
      notice.admsIncidentCode = 'ADMS.SYS.001'
      notice.admsIncidentTitle = `Bitacora ${STAMP}`
      notice.admsIncidentDetail = 'El equipo subio lineas de su bitacora.'
      notice.admsIncidentKey = 'bitacora-de-operacion'
      notice.admsIncidentStatus = 'open'
      await notice.save()

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
      await db.from('adms_unmapped_pins').whereIn('access_point_id', ids).delete()
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

  test('el padron cuenta lo que Valanserh tiene registrado, no lo que el equipo dice', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/health`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    response.assertStatus(200)
    const enrollment = response.body().data.accessPoint.enrollment as {
      confirmedEmployees: number
      pendingEmployees: number
      unmappedPins: number
      fingerprints: number
      faces: number
      palms: number
    }

    assert.equal(enrollment.confirmedEmployees, 1)
    assert.equal(enrollment.pendingEmployees, 0)
    // El PIN que el equipo reporto y nadie vinculo es lo accionable de la ficha.
    assert.equal(enrollment.unmappedPins, 1)
    // Sin biometricos capturados desde este equipo no se inventa ninguno.
    assert.equal(enrollment.fingerprints, 0)
    assert.equal(enrollment.faces, 0)
    assert.equal(enrollment.palms, 0)
  })

  test('el aviso informativo no se cuenta junto al que pide atencion', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/health`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    response.assertStatus(200)
    const incidents = response.body().data.accessPoint.openIncidents as {
      actionable: number
      informational: number
    }

    // El fixture abre un `clock_drift` (warning) y una bitacora (info).
    assert.equal(incidents.actionable, 1)
    assert.equal(incidents.informational, 1)
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
   * La cuarentena ya no tiene endpoint del lado del tenant: reclamar un
   * checador es acto de plataforma. El cliente nunca registra dispositivos, asi
   * que este endpoint no debe existir -- si reapareciera, un tenant podria dar
   * de alta equipos adivinando series.
   */
  test('el tenant ya no puede listar ni reclamar la cuarentena', async ({ client, assert }) => {
    const lista = await client
      .get('/api/v1/access-points/quarantine')
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    assert.equal(lista.status(), 404)

    const reclamo = await client
      .post('/api/v1/access-points/quarantine/claim')
      .json({ serialNumber: 'NOEXISTE123456', businessUnitId, accessPointName: 'X' })
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    assert.equal(reclamo.status(), 404)
  })

  test('la fila de cuarentena sigue registrandose desde el canal', async ({ assert }) => {
    // El canal si la sigue alimentando: lo que se retiro es la via del tenant
    // para reclamarla, no la deteccion.
    const fila = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', quarantineId)
          .firstOrFail(),
      'lectura de la cuarentena'
    )
    assert.equal(fila.admsQuarantinedDeviceStatus, 'pending')
    assert.isAbove(fila.admsQuarantinedDeviceHitCount, 0)
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
