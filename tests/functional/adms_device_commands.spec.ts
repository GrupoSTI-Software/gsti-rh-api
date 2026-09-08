import { test } from '@japa/runner'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AdmsIncident from '#models/adms_incident'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import DeviceCommand from '#models/device_command'
import User from '#models/user'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import { TenantContext } from '#utils/tenant_context'

/**
 * Rebanada 4 de extremo a extremo: encolar, entregar por `getrequest` en orden
 * de prioridad, acusar por `devicecmd` y consultar desde el Backoffice sin que
 * el payload salga nunca.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-C-${STAMP}`
const GRANT_MARK = '2000-01-03 00:00:00'

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

async function grantToRole(roleId: number, slug: string): Promise<number | null> {
  const permission = await db
    .from('system_permissions as sp')
    .join('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', 'puntos-de-acceso')
    .where('sp.system_permission_slug', slug)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!permission) throw new Error(`Falta el permiso ${slug}`)
  const existing = await db
    .from('role_system_permissions')
    .where('role_id', roleId)
    .where('system_permission_id', permission.system_permission_id)
    .whereNull('role_system_permission_deleted_at')
    .first()
  if (existing) return null
  const [id] = await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: permission.system_permission_id,
    role_system_permission_created_at: GRANT_MARK,
    role_system_permission_updated_at: GRANT_MARK,
  })
  return Number(id)
}

test.group('ADMS cola de comandos (rebanada 4)', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number
  let publicId: string
  let user: User
  const grantedIds: number[] = []

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivot = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc').firstOrFail()
      businessUnitId = pivot.businessUnitId
      const unit = await BusinessUnit.query()
        .where('businessUnitId', businessUnitId)
        .firstOrFail()
      publicId = String(unit.businessUnitPublicId)
      user = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', pivot.userId)
        .firstOrFail()

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de comandos ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap
    }, 'fixture de comandos ADMS')

    for (const slug of ['read-health', 'manage-commands']) {
      const id = await grantToRole(user.roleId, slug)
      if (id !== null) grantedIds.push(id)
    }
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (grantedIds.length > 0) {
        await db
          .from('role_system_permissions')
          .whereIn('role_system_permission_id', grantedIds)
          .delete()
      }
      await DeviceCommand.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('adms_raw_messages').where('adms_raw_message_serial', SERIAL).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de comandos ADMS')
  })

  test('el sondeo entrega un solo comando y por orden de prioridad', async ({ assert }) => {
    const service = new DeviceCommandService()
    const alta = await TenantContext.run([businessUnitId], () =>
      service.enqueue({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        kind: DEVICE_COMMAND_KIND.USER_UPSERT,
        fields: { pin: '7001', name: 'Prueba Comandos' },
        correlationKey: 'user_upsert:7001',
      })
    )
    const baja = await TenantContext.run([businessUnitId], () =>
      service.enqueue({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        kind: DEVICE_COMMAND_KIND.USER_DELETE,
        fields: { pin: '7002' },
        correlationKey: 'user_delete:7002',
      })
    )
    assert.isTrue(alta.created)
    assert.isTrue(baja.created)

    // La baja pesa mas que el alta, aunque se encolo despues.
    const first = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const firstLine = await first.text()
    assert.equal(firstLine, `C:${baja.command.deviceCommandWireId}:DATA DELETE USERINFO PIN=7002`)

    // Con uno en vuelo, el siguiente sondeo no entrega otro.
    const second = await get(`/iclock/getrequest?SN=${SERIAL}`)
    assert.equal(await second.text(), 'OK')
  })

  test('encolar dos veces la misma orden no crea dos comandos', async ({ assert }) => {
    const service = new DeviceCommandService()
    const primero = await TenantContext.run([businessUnitId], () =>
      service.enqueue({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        kind: DEVICE_COMMAND_KIND.USER_UPSERT,
        fields: { pin: '7001', name: 'Prueba Comandos' },
        correlationKey: 'user_upsert:7001',
      })
    )
    assert.isFalse(primero.created)
  })

  test('el acuse con Return=0 marca la baja como acusada, no como ejecutada', async ({
    assert,
  }) => {
    const enVuelo = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_status', 'sent')
          .firstOrFail(),
      'lectura del comando en vuelo'
    )

    const response = await postText(
      `/iclock/devicecmd?SN=${SERIAL}`,
      `ID=${enVuelo.deviceCommandWireId}&Return=0&CMD=DATA`
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK')

    const reloaded = await TenantContext.runUnscoped(
      () => DeviceCommand.findOrFail(enVuelo.deviceCommandId),
      'lectura tras el acuse'
    )
    // Es un user_delete: Return=0 solo dice recibido.
    assert.equal(reloaded.deviceCommandStatus, 'acked')
    assert.equal(reloaded.deviceCommandReturnCode, 0)
    assert.isNull(reloaded.deviceCommandExecutedAt)
  })

  test('un acuse de un comando inexistente deja incidente y responde OK', async ({ assert }) => {
    const response = await postText(`/iclock/devicecmd?SN=${SERIAL}`, 'ID=999999999&Return=0&CMD=X')
    assert.equal(await response.text(), 'OK')
    const incident = await TenantContext.runUnscoped(
      () =>
        AdmsIncident.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('adms_incident_kind', 'orphan_ack')
          .first(),
      'lectura del incidente'
    )
    assert.isNotNull(incident)
  })

  test('un codigo negativo deja el comando fallido con su motivo legible', async ({ assert }) => {
    // Se despacha el alta, que quedo pendiente tras el primer sondeo.
    const dispatched = await get(`/iclock/getrequest?SN=${SERIAL}`)
    const line = await dispatched.text()
    assert.include(line, 'DATA UPDATE USERINFO PIN=7001')
    const wireId = Number(line.split(':')[1])

    await postText(`/iclock/devicecmd?SN=${SERIAL}`, `ID=${wireId}&Return=-30&CMD=DATA`)
    const reloaded = await TenantContext.runUnscoped(
      () => DeviceCommand.query().where('device_command_wire_id', wireId).firstOrFail(),
      'lectura tras el fallo'
    )
    assert.equal(reloaded.deviceCommandStatus, 'failed')
    assert.equal(reloaded.deviceCommandLastError, 'template_version_mismatch')
  })

  test('el Backoffice lista los comandos sin exponer nunca el payload', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/commands`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    response.assertStatus(200)
    const commands = response.body().data.commands as Array<Record<string, unknown>>
    assert.isAtLeast(commands.length, 2)
    for (const command of commands) {
      assert.notProperty(command, 'payload')
      assert.notProperty(command, 'deviceCommandPayload')
      assert.notProperty(command, 'countersSnapshot')
      assert.property(command, 'kind')
      assert.property(command, 'stale')
    }
  })

  test('un comando fallido se puede reintentar y vuelve a la cola', async ({ client, assert }) => {
    const fallido = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_status', 'failed')
          .firstOrFail(),
      'lectura del fallido'
    )
    const response = await client
      .post(
        `/api/v1/access-points/${accessPoint.accessPointId}/commands/${fallido.deviceCommandId}/retry`
      )
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    response.assertStatus(200)
    assert.equal(response.body().data.command.status, 'pending')
    assert.equal(response.body().data.command.attempts, 1)
  })

  test('un comando en vuelo no se puede cancelar', async ({ client, assert }) => {
    const acusado = await TenantContext.runUnscoped(
      () =>
        DeviceCommand.query()
          .where('access_point_id', accessPoint.accessPointId)
          .where('device_command_status', 'acked')
          .firstOrFail(),
      'lectura del acusado'
    )
    const response = await client
      .post(
        `/api/v1/access-points/${accessPoint.accessPointId}/commands/${acusado.deviceCommandId}/cancel`
      )
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    response.assertStatus(409)
    assert.equal(response.body().key, 'comando-no-cancelable')
  })

  test('un comando de otro punto de acceso responde 404 desde esta ruta', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post(`/api/v1/access-points/${accessPoint.accessPointId}/commands/99999999/cancel`)
      .loginAs(user)
      .header('X-Business-Unit-Id', publicId)
    response.assertStatus(404)
    assert.equal(response.body().key, 'comando-no-encontrado')
  })
})
