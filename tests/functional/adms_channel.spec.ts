import { test } from '@japa/runner'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsRawMessage from '#models/adms_raw_message'
import AdmsIncident from '#models/adms_incident'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointStamp from '#models/access_point_stamp'
import BusinessUnit from '#models/business_unit'
import { TenantContext } from '#utils/tenant_context'

/**
 * Canal ADMS, rebanada 1 (spec v2, 4.1 a 4.6). BD real; fixture propio con serie
 * `TEST-ADMS-<stamp>` en la primera empresa activa; limpieza acotada por serie e
 * ids en `group.teardown`. Se usa `fetch` porque el cliente de Japa no manda
 * cuerpos de texto crudo con TAB.
 *
 * Rate-limit: el store del limiter es `memory` y persiste en el proceso; este
 * archivo hace menos de 300 peticiones por serie y menos de 1200 por IP.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-${STAMP}`
const UNKNOWN_SERIAL = `TEST-ADMSQ-${STAMP}`
const INVALID_SERIAL = 'BAD SN'

async function post(path: string, body: string, contentType = 'text/plain'): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'GET' })
}

test.group('ADMS channel (rebanada 1)', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number

  group.setup(async () => {
    const unit = await TenantContext.runUnscoped(
      () =>
        BusinessUnit.query()
          .whereNull('business_unit_deleted_at')
          .where('business_unit_active', 1)
          .orderBy('business_unit_id', 'asc')
          .firstOrFail(),
      'fixture del canal ADMS'
    )
    businessUnitId = unit.businessUnitId
    accessPoint = await TenantContext.runUnscoped(async () => {
      const ap = new AccessPoint()
      ap.accessPointName = `Prueba ADMS ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      return ap
    }, 'alta del punto de acceso de prueba')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await AdmsRawMessage.query()
        .whereIn('adms_raw_message_serial', [SERIAL, UNKNOWN_SERIAL])
        .delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsIncident.query()
        .whereNull('access_point_id')
        .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(adms_incident_context, '$.serial')) IN (?, ?)", [
          SERIAL,
          UNKNOWN_SERIAL,
        ])
        .delete()
      await AdmsQuarantinedDevice.query()
        .whereIn('adms_quarantined_device_serial', [SERIAL, UNKNOWN_SERIAL])
        .delete()
      await AccessPointStamp.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza del canal ADMS')
  })

  test('saludo: texto plano con stamps en cero, sin cookie', async ({ assert }) => {
    const response = await get(`/iclock/cdata?SN=${SERIAL}&options=all`)
    assert.equal(response.status, 200)
    assert.include(response.headers.get('content-type') ?? '', 'text/plain')
    assert.isNull(response.headers.get('set-cookie'))
    const text = await response.text()
    assert.include(text.split('\n'), 'ATTLOGStamp=0')
    assert.include(text.split('\n'), 'Delay=5')
    const reloaded = await TenantContext.runUnscoped(
      () => AccessPoint.findOrFail(accessPoint.accessPointId),
      'lectura del latido'
    )
    assert.isNotNull(reloaded.accessPointLastConnection)
    assert.equal(reloaded.accessPointStatus, 1)
  })

  test('ATTLOG: crudo cifrado, acuse OK: n y stamp avanzado', async ({ assert }) => {
    const line = '9999\t2026-08-12 08:53:23\t0\t1\t0\t0\t0\t255\t0\t0\t\n'
    const response = await post(`/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`, line)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')

    const raw = await TenantContext.runUnscoped(
      () =>
        AdmsRawMessage.query()
          .where('adms_raw_message_serial', SERIAL)
          .where('adms_raw_message_table', 'ATTLOG')
          .orderBy('adms_raw_message_id', 'desc')
          .firstOrFail(),
      'lectura del crudo'
    )
    assert.equal(raw.admsRawMessageBody, line)
    assert.equal(raw.admsRawMessageStatus, 'received')
    assert.equal(raw.admsRawMessageAck, 'OK: 1')
    assert.equal(raw.businessUnitId, businessUnitId)

    const stamps = await TenantContext.runUnscoped(
      () => AccessPointStamp.query().where('access_point_id', accessPoint.accessPointId),
      'lectura de stamps'
    )
    assert.equal(
      stamps.find((row) => row.accessPointStampTable === 'ATTLOG')?.accessPointStampValue,
      '9999'
    )

    const handshakeResponse = await get(`/iclock/cdata?SN=${SERIAL}&options=all`)
    const handshake = await handshakeResponse.text()
    assert.include(handshake.split('\n'), 'ATTLOGStamp=9999')
  })

  test('OPERLOG marca dialecto T&A; devicecmd en octet-stream se acusa', async ({ assert }) => {
    const operlog = 'OPLOG 82\t0\t2026-08-12 08:16:23\tadd adms address\t0\t0\t0\n'
    const response = await post(`/iclock/cdata?SN=${SERIAL}&table=OPERLOG&Stamp=9999`, operlog)
    assert.equal(await response.text(), 'OK: 1')
    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).firstOrFail(),
      'lectura del perfil'
    )
    assert.equal(profile.accessPointProfileDialect, 'ta')

    const ack = await post(
      `/iclock/devicecmd?SN=${SERIAL}`,
      'ID=1&Return=0&CMD=CHECK',
      'application/octet-stream'
    )
    assert.equal(ack.status, 200)
    assert.equal(await ack.text(), 'OK')
  })

  test('registry y push responden lo que el equipo exige; push marca CA', async ({ assert }) => {
    const registry = await post(
      `/iclock/registry?SN=${SERIAL}`,
      '~DeviceName=SpeedFace-V5L,FirmVer=3.4.9',
      'application/push;charset=UTF-8'
    )
    assert.equal(await registry.text(), `RegistryCode=RC${accessPoint.accessPointId}`)
    const push = await post(`/iclock/push?SN=${SERIAL}`, '', 'application/push;charset=UTF-8')
    const pushText = await push.text()
    const lines = pushText.split('\n')
    assert.include(lines, 'ServerName=ADMS')
    assert.isTrue(lines.some((line) => line.startsWith('TimeZone=')))
    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).firstOrFail(),
      'lectura del perfil'
    )
    assert.equal(profile.accessPointProfileDialect, 'ca')
    assert.equal(profile.accessPointProfileRegistryCode, `RC${accessPoint.accessPointId}`)
  })

  test('tabla desconocida: crudo, incidente y acuse; getrequest y ping responden OK', async ({
    assert,
  }) => {
    const response = await post(`/iclock/cdata?SN=${SERIAL}&table=FOO`, 'a\nb\n')
    assert.equal(await response.text(), 'OK: 2')
    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'unknown_table')
          .first(),
      'lectura de incidentes'
    )
    assert.isNotNull(incident)
    const getRequest = await get(`/iclock/getrequest?SN=${SERIAL}`)
    assert.equal(await getRequest.text(), 'OK')
    const ping = await get(`/iclock/ping?SN=${SERIAL}`)
    assert.equal(await ping.text(), 'OK')
  })

  test('serie desconocida va a cuarentena; serie invalida no toca la base', async ({ assert }) => {
    const first = await get(`/iclock/cdata?SN=${UNKNOWN_SERIAL}&options=all`)
    assert.equal(await first.text(), 'OK')
    await post(
      `/iclock/cdata?SN=${UNKNOWN_SERIAL}&table=ATTLOG&Stamp=9999`,
      '1\t2026-08-12 08:53:23\t0\t1\n'
    )
    const row = await AdmsQuarantinedDevice.query()
      .where('adms_quarantined_device_serial', UNKNOWN_SERIAL)
      .firstOrFail()
    assert.equal(row.admsQuarantinedDeviceStatus, 'pending')
    assert.equal(row.admsQuarantinedDeviceHitCount, 2)

    const invalid = await get(`/iclock/cdata?SN=${encodeURIComponent(INVALID_SERIAL)}&options=all`)
    assert.equal(await invalid.text(), 'OK')
    const none = await AdmsQuarantinedDevice.query()
      .where('adms_quarantined_device_serial', INVALID_SERIAL)
      .first()
    assert.isNull(none)
  })

  test('equipo inactivo recibe OK pelon e incidente', async ({ assert }) => {
    await TenantContext.runUnscoped(
      () =>
        db
          .from('access_points')
          .where('access_point_id', accessPoint.accessPointId)
          .update({ access_point_active: 0 }),
      'desactivar el punto de acceso de prueba'
    )
    const response = await get(`/iclock/cdata?SN=${SERIAL}&options=all`)
    assert.equal(await response.text(), 'OK')
    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'device_inactive')
          .first(),
      'lectura de incidentes'
    )
    assert.isNotNull(incident)
    await TenantContext.runUnscoped(
      () =>
        db
          .from('access_points')
          .where('access_point_id', accessPoint.accessPointId)
          .update({ access_point_active: 1 }),
      'reactivar el punto de acceso de prueba'
    )
  })

  test('ruta GET desconocida responde 404 y nunca OK', async ({ assert }) => {
    const response = await get('/iclock/doc/biophoto/abc/9999.jpg')
    assert.equal(response.status, 404)
    const other = await get(`/iclock/whatever?SN=${SERIAL}`)
    assert.equal(other.status, 404)
    assert.notEqual(await other.text(), 'OK')
  })

  test('cuerpo por encima del tope responde 413 sin acuse', async ({ assert }) => {
    const huge = 'x'.repeat(4 * 1024 * 1024 + 1)
    const response = await post(`/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`, huge)
    assert.equal(response.status, 413)
  })
})
