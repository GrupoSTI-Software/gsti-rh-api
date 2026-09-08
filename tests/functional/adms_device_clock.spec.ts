import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AdmsIncident from '#models/adms_incident'
import BusinessUnit from '#models/business_unit'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import { fromZkDateTime } from '#modules/device-commands/wire/zk_datetime'
import { TenantContext } from '#utils/tenant_context'

/**
 * Rebanada 5 de extremo a extremo. Lo que se demuestra aqui es lo que la
 * bateria dejo claro que hay que demostrar: la correccion del reloj NO se da
 * por buena con el acuse del equipo, sino con una checada real.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-K-${STAMP}`

/** Hora local del equipo, corrida a proposito respecto de la real. */
function localTimeWithDrift(zone: string, driftSeconds: number): string {
  return DateTime.utc()
    .minus({ seconds: driftSeconds })
    .startOf('second')
    .setZone(zone)
    .toFormat('yyyy-MM-dd HH:mm:ss')
}

async function postAttlog(body: string): Promise<Response> {
  return fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })
}

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'GET' })
}

async function postText(path: string, body: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body,
  })
}

test.group('ADMS reloj del checador (rebanada 5)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let zone: string
  const createdAssistIds: number[] = []

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereNotNull('business_unit_id')
        .whereNotNull('employee_code')
        .orderBy('employee_id', 'asc')
        .firstOrFail()
      businessUnitId = employee.businessUnitId as number
      const unit = await BusinessUnit.query()
        .where('business_unit_id', businessUnitId)
        .firstOrFail()
      zone = unit.businessUnitTimezone

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de reloj ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap

      const profile = new AccessPointProfile()
      profile.accessPointId = ap.accessPointId
      profile.businessUnitId = businessUnitId
      profile.accessPointProfileDialect = 'ta'
      profile.accessPointProfileLayoutKnown = 1
      profile.accessPointProfilePlatform = 'ZAM180_TFT'
      await profile.save()
    }, 'fixture del reloj ADMS')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (createdAssistIds.length > 0) {
        await db.from('assists').whereIn('assist_id', createdAssistIds).delete()
      }
      await db
        .from('assist_calendar_recalc_jobs')
        .where('business_unit_id', businessUnitId)
        .where('employee_id', employee.employeeId)
        .delete()
      await DeviceCommand.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_point_stamps').where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza del reloj ADMS')
  })

  test('una subida con el reloj corrido mide la deriva y encola el ajuste', async ({ assert }) => {
    const code = String(employee.employeeCode)
    // Cinco minutos de atraso: muy por encima del umbral de un minuto.
    const local = localTimeWithDrift(zone, 300)
    const response = await postAttlog(`${code}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t\n`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')

    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query()
          .where('access_point_id', accessPoint.accessPointId)
          .firstOrFail(),
      'lectura del perfil'
    )
    assert.isNotNull(profile.accessPointProfileClockOffsetSeconds)
    assert.isAtLeast(profile.accessPointProfileClockOffsetSeconds as number, 290)
    assert.isNotNull(profile.accessPointProfileClockMeasuredAt)

    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'clock_drift')
          .first(),
      'lectura del incidente'
    )
    assert.isNotNull(incident)

    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'clock_sync')
          .firstOrFail(),
      'lectura del comando de reloj'
    )
    assert.equal(command.deviceCommandStatus, 'pending')
    assert.equal(command.deviceCommandCorrelationKey, 'clock')

    const assist = await TenantContext.runUnscoped(
      () =>
        db.from('assists').where('assist_terminal_sn', SERIAL).orderBy('assist_id', 'desc').first(),
      'lectura de la checada'
    )
    if (assist) createdAssistIds.push(assist.assist_id)
  })

  test('el sondeo entrega el ajuste con la hora del momento, no la del encolado', async ({
    assert,
  }) => {
    const antesDelDespacho = DateTime.utc()
    const response = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const line = await response.text()
    assert.match(line, /^C:\d+:SET OPTION DateTime=\d+$/)

    const value = Number(line.split('DateTime=')[1])
    const parts = fromZkDateTime(value)
    const esperado = antesDelDespacho.setZone(zone)

    // La hora que sale es la del despacho en la zona del equipo, no la UTC ni
    // la de cuando se encolo.
    assert.equal(parts.year, esperado.year)
    assert.equal(parts.month, esperado.month)
    assert.equal(parts.day, esperado.day)
    assert.equal(parts.hour, esperado.hour)
    assert.isAtMost(Math.abs(parts.minute - esperado.minute), 1)
  })

  test('el acuse deja el ajuste acusado y NO ejecutado', async ({ assert }) => {
    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'clock_sync')
          .firstOrFail(),
      'lectura del comando'
    )
    await postText(
      `/iclock/devicecmd?SN=${SERIAL}`,
      `ID=${command.deviceCommandWireId}&Return=0&CMD=SET`
    )

    const reloaded = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(command.deviceCommandId),
      'lectura tras el acuse'
    )
    // Return=0 con la hora buena y con la mala es identico: no basta.
    assert.equal(reloaded.deviceCommandStatus, 'acked')
    assert.isNull(reloaded.deviceCommandExecutedAt)
  })

  test('una checada con la hora ya correcta es la que confirma el ajuste', async ({ assert }) => {
    const code = String(employee.employeeCode)
    // Varias checadas buenas para que la mediana de la ventana baje del umbral.
    const lineas = Array.from({ length: 5 }, (_unused, index) => {
      const local = localTimeWithDrift(zone, index)
      return `${code}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t`
    }).join('\n')
    const response = await postAttlog(`${lineas}\n`)
    assert.equal(response.status, 200)

    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'clock_sync')
          .firstOrFail(),
      'lectura del comando tras la checada buena'
    )
    assert.equal(command.deviceCommandStatus, 'executed')
    assert.equal(command.deviceCommandExecutionEvidence, 'attlog_drift_ok')

    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query()
          .where('access_point_id', accessPoint.accessPointId)
          .firstOrFail(),
      'lectura del perfil'
    )
    assert.equal(profile.accessPointProfileClockSyncStatus, 'ok')
    assert.isNotNull(profile.accessPointProfileClockSyncedAt)

    const assists = await TenantContext.runUnscoped(
      () => db.from('assists').where('assist_terminal_sn', SERIAL).select('assist_id'),
      'checadas creadas'
    )
    for (const row of assists) {
      if (!createdAssistIds.includes(row.assist_id)) createdAssistIds.push(row.assist_id)
    }
  })
})
