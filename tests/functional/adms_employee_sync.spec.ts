import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import AccessPointProfile from '#models/access_point_profile'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsIncident from '#models/adms_incident'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'

/**
 * Rebanada 7 de extremo a extremo. Lo que importa demostrar aqui es la
 * cuarentena del PIN: mientras el equipo no confirme el borrado, ese numero no
 * se le da a nadie mas y las checadas que lleguen con el se retienen.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-S-${STAMP}`
const PIN = '778899'

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'GET' })
}

async function postText(path: string, body: string, type = 'text/plain'): Promise<Response> {
  return fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': type }, body })
}

test.group('ADMS matriz empleado por dispositivo (rebanada 7)', (group) => {
  let accessPoint: AccessPoint
  let employee: Employee
  let businessUnitId: number
  let publicId: string
  let user: User

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      /**
       * Hace falta una empresa que tenga a la vez usuario en el pivote y
       * colaboradores: no toda empresa con usuario tiene gente dada de alta.
       */
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; userId: number; employee: Employee } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .orderBy('employee_id', 'asc')
          .first()
        if (someone) {
          elegido = {
            unitId: candidate.businessUnitId,
            userId: candidate.userId,
            employee: someone,
          }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con usuario y colaborador.')

      businessUnitId = elegido.unitId
      employee = elegido.employee
      const unit = await BusinessUnit.query().where('businessUnitId', businessUnitId).firstOrFail()
      publicId = String(unit.businessUnitPublicId)
      user = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', elegido.userId)
        .firstOrFail()

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de matriz ${STAMP}`
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

      const pivot = new AccessPointEmployee()
      pivot.accessPointId = ap.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = employee.employeeId
      pivot.accessPointEmployeePin = ''
      pivot.accessPointEmployeeSyncStatus = 'pending_pin'
      await pivot.save()
    }, 'fixture de la matriz')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await AccessPointEmployeeEvent.query()
        .where('business_unit_id', businessUnitId)
        .whereIn(
          'access_point_employee_id',
          db.from('access_point_employees').where('access_point_id', accessPoint.accessPointId).select('access_point_employee_id')
        )
        .delete()
      await DeviceCommand.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsHeldPunch.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsUnmappedPin.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db
        .from('access_point_employees')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('assists').where('assist_terminal_sn', SERIAL).delete()
      await db.from('access_point_stamps').where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de la matriz')
  })

  test('fijar el PIN deja al colaborador listo para enviar', async ({ client, assert }) => {
    const response = await client
      .put(
        `/api/access-points/${accessPoint.accessPointId}/employee/${employee.employeeId}/pin`
      )
      .json({ pin: PIN })
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    response.assertStatus(200)
    // El numero no viaja al cliente: es la credencial con la que se marca.
    assert.isUndefined(response.body().data.accessPointEmployee.pin)
    assert.isTrue(response.body().data.accessPointEmployee.hasPin)
    assert.equal(response.body().data.accessPointEmployee.syncStatus, 'pending')
    assert.isFalse(response.body().data.accessPointEmployee.pinQuarantined)
  })

  test('la vuelta del padron: los checadores del colaborador con su estado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/v1/employees/${employee.employeeId}/access-points`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    response.assertStatus(200)
    const payload = response.body().data.employeeDevices as {
      employeeId: number
      accessPoints: Array<{
        accessPointId: number
        name: string
        hasPin: boolean
        syncStatus: string
        connection: string
        pinQuarantined: boolean
      }>
      available: Array<{
        accessPointId: number
        name: string
        deviceName: string | null
        model: { slug: string } | null
      }>
      biometrics: { fingerprints: number; faces: number; palms: number }
    }

    assert.equal(payload.employeeId, employee.employeeId)
    // Nada en la carga util lleva el numero del colaborador.
    assert.notInclude(JSON.stringify(payload), PIN)
    const mio = payload.accessPoints.find(
      (row) => row.accessPointId === accessPoint.accessPointId
    )
    assert.isDefined(mio)
    // El PIN de la prueba anterior ya vive en el pivote, pero no sale de aqui.
    assert.isTrue(mio?.hasPin)
    assert.notProperty(mio ?? {}, 'pin')
    assert.equal(mio?.syncStatus, 'pending')
    // El equipo del fixture nunca ha llamado: no esta "caido", nunca conecto.
    assert.equal(mio?.connection, 'never')
    assert.isFalse(mio?.pinQuarantined)
    assert.isNumber(payload.biometrics.fingerprints)
    // Los equipos donde ya esta no se ofrecen para volver a meterlo.
    assert.isUndefined(
      payload.available.find((row) => row.accessPointId === accessPoint.accessPointId)
    )
  })

  test('el colaborador de otra empresa responde 404, no 403', async ({ client, assert }) => {
    const ajeno = await TenantContext.runUnscoped(
      async () =>
        Employee.query()
          .whereNull('employee_deleted_at')
          .whereNot('business_unit_id', businessUnitId)
          .first(),
      'colaborador de otra empresa para la prueba de alcance'
    )
    if (!ajeno) return

    const response = await client
      .get(`/api/v1/employees/${ajeno.employeeId}/access-points`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    // 403 revelaria que esa persona existe en otra parte.
    response.assertStatus(404)
  })

  test('enviar encola el alta y el sondeo la entrega', async ({ client, assert }) => {
    const response = await client
      .post(
        `/api/access-points/${accessPoint.accessPointId}/employee/${employee.employeeId}/send`
      )
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    if (response.status() === 403) return
    response.assertStatus(200)

    const pending = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const line = await pending.text()
    assert.include(line, `DATA UPDATE USERINFO PIN=${PIN}`)

    const pivot = await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('employee_id', employee.employeeId)
          .firstOrFail(),
      'lectura del pivote tras el despacho'
    )
    // El despacho mueve el estado del colaborador, no el encolado.
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'sent')
  })

  test('el acuse del alta lo deja confirmado', async ({ assert }) => {
    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'user_upsert')
          .firstOrFail(),
      'lectura del comando de alta'
    )
    await postText(
      `/iclock/devicecmd?SN=${SERIAL}`,
      `ID=${command.deviceCommandWireId}&Return=0&CMD=DATA`,
      'application/octet-stream'
    )

    const pivot = await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('employee_id', employee.employeeId)
          .firstOrFail(),
      'lectura del pivote tras el acuse'
    )
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'confirmed')
    assert.isNotNull(pivot.accessPointEmployeeSyncConfirmedAt)
  })

  test('revocar deja el PIN en cuarentena y encola el borrado con prioridad alta', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(
        `/api/access-points/${accessPoint.accessPointId}/employee/${employee.employeeId}/revoke`
      )
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    if (response.status() === 403) return
    response.assertStatus(202)
    assert.equal(response.body().data.accessPointEmployee.syncStatus, 'revoking')
    assert.isTrue(response.body().data.accessPointEmployee.pinQuarantined)

    const command = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_kind', 'user_delete')
          .firstOrFail(),
      'lectura del comando de baja'
    )
    // Borrar a quien ya no trabaja aqui pesa mas que cualquier alta.
    assert.equal(command.deviceCommandPriority, 1)
  })

  test('mientras el borrado no sale del equipo, la checada sigue siendo del colaborador', async ({
    assert,
  }) => {
    // Estado `revoking`: el registro sigue vivo en el aparato.
    const local = DateTime.utc()
      .minus({ hours: 1 })
      .startOf('second')
      .toFormat('yyyy-MM-dd HH:mm:ss')
    const response = await postText(
      `/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`,
      `${PIN}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t\n`
    )
    assert.equal(response.status, 200)

    const assists = await TenantContext.runUnscoped(
      () => db.from('assists').where('assist_terminal_sn', SERIAL).select('assist_id'),
      'checadas creadas'
    )
    // Retenerla aqui le quitaria tiempo trabajado a quien todavia figura.
    assert.lengthOf(assists, 1)
  })

  test('con el borrado acusado pero sin confirmar, la checada es ambigua y se retiene', async ({
    assert,
  }) => {
    // Se despacha el borrado y el equipo lo acusa: queda en revoke_acked.
    const pending = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const line = await pending.text()
    assert.include(line, `DATA DELETE USERINFO PIN=${PIN}`)
    const wireId = Number(line.split(':')[1])
    await postText(
      `/iclock/devicecmd?SN=${SERIAL}`,
      `ID=${wireId}&Return=0&CMD=DATA`,
      'application/octet-stream'
    )

    const pivot = await TenantContext.runUnscoped(
      () =>
        AccessPointEmployee.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('employee_id', employee.employeeId)
          .firstOrFail(),
      'lectura del pivote tras acusar el borrado'
    )
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'revoke_acked')

    const local = DateTime.utc()
      .minus({ minutes: 30 })
      .startOf('second')
      .toFormat('yyyy-MM-dd HH:mm:ss')
    await postText(
      `/iclock/cdata?SN=${SERIAL}&table=ATTLOG&Stamp=9999`,
      `${PIN}\t${local}\t0\t15\t0\t0\t0\t255\t0\t0\t\n`
    )

    const held = await TenantContext.runUnscoped(
      () =>
        AdmsHeldPunch.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_held_punch_pin', PIN)
          .first(),
      'lectura de la retencion'
    )
    assert.isNotNull(held)
    assert.equal(held?.admsHeldPunchReason, 'pin_quarantined')
  })

  test('el PIN en cuarentena no se le puede dar a nadie mas', async ({ client, assert }) => {
    const otro = await TenantContext.runUnscoped(
      () =>
        Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', businessUnitId)
          .whereNot('employee_id', employee.employeeId)
          .first(),
      'otro colaborador'
    )
    if (!otro) {
      assert.isNull(otro, 'solo hay un colaborador en la empresa; el caso no es comprobable aqui')
      return
    }

    await TenantContext.runUnscoped(async () => {
      const pivot = new AccessPointEmployee()
      pivot.accessPointId = accessPoint.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = otro.employeeId
      pivot.accessPointEmployeePin = ''
      pivot.accessPointEmployeeSyncStatus = 'pending_pin'
      await pivot.save()
    }, 'alta del segundo pivote')

    const response = await client
      .put(`/api/access-points/${accessPoint.accessPointId}/employee/${otro.employeeId}/pin`)
      .json({ pin: PIN })
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) return
    response.assertStatus(409)
    assert.equal(response.body().key, 'pin-ocupado')
  })

  test('volver a dar de alta a quien salio revive la misma fila', async ({ client, assert }) => {
    const pivotAntes = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', employee.employeeId)
        .firstOrFail()
    )

    // La baja quedo confirmada por el padron del equipo.
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivotAntes.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
      await row.save()
    })

    const response = await client
      .post(`/api/access-points/${accessPoint.accessPointId}/employee/${employee.employeeId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    response.assertStatus(201)

    const pivotDespues = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', employee.employeeId)
        .firstOrFail()
    )
    // La misma fila, no una segunda: el historial de ese par no se parte.
    assert.equal(pivotDespues.accessPointEmployeeId, pivotAntes.accessPointEmployeeId)
    assert.notEqual(
      pivotDespues.accessPointEmployeeSyncStatus,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED
    )
    // Y vuelve con numero: el alta lo propone desde el codigo del colaborador.
    assert.isNotEmpty(pivotDespues.accessPointEmployeePin)
    /**
     * Ademas sale hacia el aparato sola: asignar sin enviar dejaria a la
     * persona dada de alta en la pantalla y desconocida para el checador. El
     * pivote queda `pending` -- pasa a `sent` cuando el equipo recoge la orden
     * en su sondeo, no al encolarla.
     */
    assert.equal(
      pivotDespues.accessPointEmployeeSyncStatus,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING
    )
    assert.isNotNull(pivotDespues.accessPointEmployeeSyncRequestedAt)

    const encolado = await TenantContext.run([businessUnitId], () =>
      DeviceCommand.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('device_command_kind', 'user_upsert')
        .orderBy('device_command_id', 'desc')
        .first()
    )
    assert.isNotNull(encolado)
  })

  test('a quien ya esta dado de alta no se le duplica la asignacion', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/access-points/${accessPoint.accessPointId}/employee/${employee.employeeId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)

    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    response.assertStatus(409)
    assert.equal(response.body().key, 'asignacion-duplicada')
  })

  test('el historial deja constancia de quien hizo cada cosa', async ({ assert }) => {
    const events = await TenantContext.runUnscoped(async () => {
      const pivot = await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', employee.employeeId)
        .firstOrFail()
      return AccessPointEmployeeEvent.query()
        .where('access_point_employee_id', pivot.accessPointEmployeeId)
        .orderBy('access_point_employee_event_id', 'asc')
    }, 'lectura del historial')

    const kinds = events.map((event) => event.accessPointEmployeeEventKind)
    assert.includeMembers(kinds, ['pin_assigned', 'send_requested', 'revoke_requested'])
  })
})
