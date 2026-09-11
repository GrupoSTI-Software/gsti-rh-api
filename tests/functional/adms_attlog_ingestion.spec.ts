import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointStamp from '#models/access_point_stamp'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsIncident from '#models/adms_incident'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import Assist from '#models/assist'
import AssistCalendarRecalcJob from '#models/assist_calendar_recalc_job'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'

/**
 * Rebanada 3 de extremo a extremo: una subida ATTLOG del checador se convierte
 * en una checada real de Valanserh, con hora correcta, sin duplicar en el
 * reenvio y sin recalcular dentro de la peticion.
 *
 * BD real; fixture propio `TEST-ADMS-I-<stamp>`; se usa un empleado vivo ya
 * existente y su codigo como PIN. Limpieza acotada por serie e ids.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-I-${STAMP}`
const UNKNOWN_PIN = '8999123'

/**
 * Base de la corrida, leida UNA vez.
 *
 * Antes cada llamada releia el reloj, asi que "el mismo instante" solo era el
 * mismo si los dos tests que lo pedian no cruzaban un borde de segundo. La
 * llave natural de la checada incluye el instante y la UNIQUE de la retencion
 * tambien: un segundo de diferencia crea fila nueva, y la prueba del reenvio
 * identico pasaba a comprobar otra cosa sin avisar.
 */
const RUN_BASE = DateTime.utc().minus({ hours: 2 }).startOf('second')

/** Instante irrepetible por corrida, en hora local del equipo. */
function localTimeFor(offsetSeconds: number, zone: string): string {
  return RUN_BASE.plus({ seconds: offsetSeconds }).setZone(zone).toFormat('yyyy-MM-dd HH:mm:ss')
}

async function postAttlog(body: string): Promise<Response> {
  return fetch(`${BASE}/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })
}

test.group('ADMS ingesta de checadas (rebanada 3)', (group) => {
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
      ap.accessPointName = `Checador de ingesta ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap

      // El perfil declara la plataforma para que el parser use su disposicion.
      const profile = new AccessPointProfile()
      profile.accessPointId = ap.accessPointId
      profile.businessUnitId = businessUnitId
      profile.accessPointProfileDialect = 'ta'
      profile.accessPointProfileLayoutKnown = 1
      profile.accessPointProfilePlatform = 'ZAM180_TFT'
      await profile.save()
    }, 'fixture de ingesta ADMS')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (createdAssistIds.length > 0) {
        await db.from('assists').whereIn('assist_id', createdAssistIds).delete()
      }
      await AssistCalendarRecalcJob.query()
        .where('business_unit_id', businessUnitId)
        .where('employee_id', employee.employeeId)
        .delete()
      await AdmsHeldPunch.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsUnmappedPin.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      // El ajuste de reloj se encola solo cuando la deriva pasa el umbral, y
      // la FK a access_points es RESTRICT: sin esto el equipo no se puede
      // borrar y la basura se acumula entre corridas.
      await db.from('device_commands').where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointStamp.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de ingesta ADMS')
  })

  test('una checada del checador llega a assists con hora en UTC y no se recalcula en linea', async ({
    assert,
  }) => {
    const code = String(employee.employeeCode)
    const local = localTimeFor(0, zone)
    const response = await postAttlog(`${code}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t\n`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')

    const assist = await TenantContext.runUnscoped(
      () =>
        Assist.query()
          .where('assist_terminal_sn', SERIAL)
          .orderBy('assist_id', 'desc')
          .firstOrFail(),
      'lectura de la checada'
    )
    createdAssistIds.push(assist.assistId)

    assert.equal(assist.assistOrigin, 'adms')
    assert.equal(assist.assistEmpId, employee.employeeId)
    assert.equal(assist.assistVerifyMethod, 15)
    assert.equal(assist.assistTerminalAlias, `Checador de ingesta ${STAMP}`)
    assert.equal(assist.businessUnitId, businessUnitId)

    // La hora local del equipo, leida en la zona de la sede, es el instante UTC.
    const expected = DateTime.fromFormat(local, 'yyyy-MM-dd HH:mm:ss', { zone }).toUTC()
    assert.equal(
      assist.assistPunchTimeUtc.toUTC().toISO({ suppressMilliseconds: true }),
      expected.toISO({ suppressMilliseconds: true })
    )

    // El recalculo salio de la peticion: quedo encolado.
    const jobs = await TenantContext.runUnscoped(
      () =>
        AssistCalendarRecalcJob.query()
          .where('business_unit_id', businessUnitId)
          .where('employee_id', employee.employeeId)
          .where('assist_calendar_recalc_job_status', 'pending'),
      'lectura de la cola de recalculo'
    )
    assert.isAtLeast(jobs.length, 1)
  })

  test('el PIN se dedujo del codigo del colaborador y quedo el pivote inferido', async ({
    assert,
  }) => {
    const pivot = await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('employee_id', employee.employeeId)
          .firstOrFail(),
      'lectura del pivote'
    )
    assert.equal(pivot.accessPointEmployeePin, String(employee.employeeCode))
    assert.equal(pivot.accessPointEmployeePinSource, 'inferred')
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'confirmed')
  })

  test('el reenvio identico se acusa igual y no crea una segunda fila', async ({ assert }) => {
    const code = String(employee.employeeCode)
    const local = localTimeFor(0, zone)
    const before = await TenantContext.runUnscoped(
      () => Assist.query().where('assist_terminal_sn', SERIAL),
      'conteo previo'
    )
    const response = await postAttlog(`${code}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t\n`)
    assert.equal(await response.text(), 'OK: 1')
    const after = await TenantContext.runUnscoped(
      () => Assist.query().where('assist_terminal_sn', SERIAL),
      'conteo posterior'
    )
    assert.equal(after.length, before.length)
  })

  test('un PIN sin dueno se retiene y entra a la cola de conciliacion', async ({ assert }) => {
    const local = localTimeFor(60, zone)
    const response = await postAttlog(`${UNKNOWN_PIN}\t${local}\t0\t1\t0\t0\t0\t255\t0\t0\t\n`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')

    const held = await TenantContext.runUnscoped(
      () =>
        AdmsHeldPunch.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_held_punch_pin', UNKNOWN_PIN)
          .firstOrFail(),
      'lectura de la retencion'
    )
    assert.equal(held.admsHeldPunchReason, 'unknown_pin')
    assert.equal(held.admsHeldPunchStatus, 'held')
    assert.equal(held.admsHeldPunchVerify, 1)

    const unmapped = await TenantContext.runUnscoped(
      () =>
        AdmsUnmappedPin.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_unmapped_pin_pin', UNKNOWN_PIN)
          .firstOrFail(),
      'lectura del PIN desconocido'
    )
    assert.equal(unmapped.admsUnmappedPinStatus, 'pending')
    assert.isAtLeast(unmapped.admsUnmappedPinPunchCount, 1)

    // Y no se creo ninguna checada para ese PIN.
    const assists = await TenantContext.runUnscoped(
      () => Assist.query().where('assist_terminal_sn', SERIAL).where('assist_emp_code', UNKNOWN_PIN),
      'checadas del PIN desconocido'
    )
    assert.lengthOf(assists, 0)
  })

  test('el reenvio de una retenida no la duplica', async ({ assert }) => {
    const local = localTimeFor(60, zone)
    await postAttlog(`${UNKNOWN_PIN}\t${local}\t0\t1\t0\t0\t0\t255\t0\t0\t\n`)
    const held = await TenantContext.runUnscoped(
      () =>
        AdmsHeldPunch.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_held_punch_pin', UNKNOWN_PIN),
      'conteo de retenidas'
    )
    assert.lengthOf(held, 1)
  })

  test('una linea ilegible no impide que la buena entre', async ({ assert }) => {
    const code = String(employee.employeeCode)
    const local = localTimeFor(120, zone)
    const response = await postAttlog(`basura sin tabuladores\n${code}\t${local}\t0\t1\n`)
    assert.equal(await response.text(), 'OK: 2')

    const assist = await TenantContext.runUnscoped(
      () =>
        Assist.query()
          .where('assist_terminal_sn', SERIAL)
          .orderBy('assist_id', 'desc')
          .firstOrFail(),
      'lectura de la checada tras la linea ilegible'
    )
    createdAssistIds.push(assist.assistId)
    assert.equal(assist.assistEmpId, employee.employeeId)

    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'parse_error')
          .first(),
      'lectura del incidente'
    )
    assert.isNotNull(incident)
  })
})
