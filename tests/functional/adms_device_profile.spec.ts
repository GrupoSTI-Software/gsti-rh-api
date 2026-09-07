import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointProfile from '#models/access_point_profile'
import AccessPointStamp from '#models/access_point_stamp'
import AdmsIncident from '#models/adms_incident'
import AdmsRawMessage from '#models/adms_raw_message'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import User from '#models/user'
import PermissionGateService from '#services/permission_gate_service'
import { ACCESS_POINT_PERMISSION_DECLARATIONS } from '#constants/access_point_permission_declarations'
import { TenantContext } from '#utils/tenant_context'

/**
 * Rebanada 2 (spec 9.1, 4.4 y 11): options al perfil, endpoints de perfil y
 * avance de subida, permisos por evaluateEnforced y aislamiento por empresa.
 * BD real; fixture propio `TEST-ADMS-P-<stamp>`; las concesiones de permiso que
 * hace la prueba se retiran por id en el teardown.
 */
const BASE = `http://${env.get('HOST')}:${env.get('PORT')}`
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ADMS-P-${STAMP}`
const GRANT_MARK = '2000-01-02 00:00:00'

const V5L =
  '~DeviceName=SpeedFace-V5L,MAC=00:17:61:13:20:21,UserCount=1,~MaxUserCount=100,FPVersion=10,~MaxFingerCount=60,FPCount=1,FaceVersion=39,~MaxFaceCount=6000,FaceCount=0,IPAddress=192.168.1.59,~Platform=ZAM180_TFT,~OEMVendor=ZKTECO CO., LTD.,FWVersion=ZAM180-NF50VA-Ver3.4.9,PushVersion=Ver 2.0.33S-20220623'

async function postOptions(serial: string, body: string): Promise<Response> {
  return fetch(`${BASE}/iclock/cdata?SN=${serial}&table=options`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  })
}

interface FixtureUnit {
  businessUnitId: number
  publicId: string
  user: User
}

interface Fixture {
  own: FixtureUnit
  foreign: FixtureUnit | null
}

async function resolveFixture(): Promise<Fixture> {
  return TenantContext.runUnscoped(async () => {
    const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
    const seen = new Map<number, BusinessUnitUser>()
    for (const pivot of pivots) {
      if (!seen.has(pivot.businessUnitId)) seen.set(pivot.businessUnitId, pivot)
    }
    const candidates: FixtureUnit[] = []
    for (const [businessUnitId, pivot] of seen) {
      const unit = await BusinessUnit.query()
        .where('businessUnitId', businessUnitId)
        .whereNull('business_unit_deleted_at')
        .first()
      const user = await User.query()
        .whereNull('user_deleted_at')
        .where('user_id', pivot.userId)
        .first()
      if (unit && user) {
        candidates.push({
          businessUnitId,
          publicId: String(unit.businessUnitPublicId),
          user,
        })
      }
      if (candidates.length === 2) break
    }
    if (candidates.length === 0) throw new Error('Se requiere una empresa con usuario en pivote.')
    return { own: candidates[0], foreign: candidates[1] ?? null }
  }, 'fixture del perfil ADMS')
}

/** Concede un permiso del modulo al rol; devuelve el id creado o null si ya lo tenia. */
async function grantToRole(roleId: number, slug: string): Promise<number | null> {
  const permission = await db
    .from('system_permissions as sp')
    .join('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', 'puntos-de-acceso')
    .where('sp.system_permission_slug', slug)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!permission) throw new Error(`Falta el permiso ${slug}: correr la migracion 1788912000008`)
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

test.group('ADMS device profile y upload progress (rebanada 2)', (group) => {
  let fixture: Fixture
  let accessPoint: AccessPoint
  const grantedIds: number[] = []

  group.setup(async () => {
    fixture = await resolveFixture()
    accessPoint = await TenantContext.runUnscoped(async () => {
      const ap = new AccessPoint()
      ap.accessPointName = `Prueba perfil ADMS ${STAMP}`
      ap.businessUnitId = fixture.own.businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      return ap
    }, 'alta del punto de acceso de prueba')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (grantedIds.length > 0) {
        await db
          .from('role_system_permissions')
          .whereIn('role_system_permission_id', grantedIds)
          .delete()
      }
      await AdmsRawMessage.query().where('adms_raw_message_serial', SERIAL).delete()
      await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointStamp.query().where('access_point_id', accessPoint.accessPointId).delete()
      await AccessPointProfile.query().where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza del perfil ADMS')
  })

  test('options llena el perfil, copia la identidad al punto de acceso y se acusa', async ({
    assert,
  }) => {
    const response = await postOptions(SERIAL, V5L)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'OK: 1')
    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query()
          .where('access_point_id', accessPoint.accessPointId)
          .firstOrFail(),
      'lectura del perfil'
    )
    assert.equal(profile.accessPointProfilePlatform, 'ZAM180_TFT')
    assert.equal(profile.accessPointProfileFwVersion, 'ZAM180-NF50VA-Ver3.4.9')
    assert.equal(profile.accessPointProfileFpVersion, '10')
    assert.equal(profile.accessPointProfileFaceVersion, '39')
    assert.equal(profile.accessPointProfileLayoutKnown, 1)
    assert.equal(profile.accessPointProfileMaxFingerCount, 60)
    assert.equal(profile.accessPointProfileOemVendor, 'ZKTECO CO., LTD.')
    assert.isNotNull(profile.accessPointProfileOptionsReadAt)

    const reloaded = await TenantContext.runUnscoped(
      () => AccessPoint.findOrFail(accessPoint.accessPointId),
      'lectura del punto de acceso'
    )
    assert.equal(reloaded.accessPointFirmware, 'ZAM180-NF50VA-Ver3.4.9')
    assert.equal(reloaded.accessPointPlatform, 'ZAM180_TFT')
    assert.equal(reloaded.accessPointDeviceName, 'SpeedFace-V5L')

    const raw = await TenantContext.runUnscoped(
      () =>
        AdmsRawMessage.query()
          .where('adms_raw_message_serial', SERIAL)
          .where('adms_raw_message_table', 'options')
          .orderBy('adms_raw_message_id', 'desc')
          .firstOrFail(),
      'lectura del crudo'
    )
    assert.equal(raw.admsRawMessageStatus, 'processed')
  })

  test('cambio de firmware y plataforma desconocida dejan incidentes sin bloquear', async ({
    assert,
  }) => {
    await postOptions(
      SERIAL,
      V5L.replace('Ver3.4.9', 'Ver3.5.0').replace('ZAM180_TFT', 'ZMM220_TFT')
    )
    const kinds = await TenantContext.runUnscoped(async () => {
      const rows = await AdmsIncident.query().where('access_point_id', accessPoint.accessPointId)
      return rows.map((row) => row.admsIncidentKind)
    }, 'lectura de incidentes')
    assert.includeMembers(kinds, ['version_changed', 'unknown_platform'])
    const profile = await TenantContext.runUnscoped(
      () =>
        AccessPointProfile.query()
          .where('access_point_id', accessPoint.accessPointId)
          .firstOrFail(),
      'lectura del perfil'
    )
    assert.equal(profile.accessPointProfileLayoutKnown, 0)
    assert.equal(profile.accessPointProfileFwVersion, 'ZAM180-NF50VA-Ver3.5.0')
  })

  test('sin permiso read-health el perfil responde 403 (salvo bypass documentado del rol)', async ({
    client,
    assert,
  }) => {
    const decision = await new PermissionGateService().evaluateEnforced(
      fixture.own.user,
      ACCESS_POINT_PERMISSION_DECLARATIONS.readHealth
    )
    const response = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/profile`)
      .loginAs(fixture.own.user)
      .header('X-Business-Unit-Id', fixture.own.publicId)
    if (decision.allowed) {
      assert.oneOf(decision.reason, ['bypass', 'granted'])
      response.assertStatus(200)
      return
    }
    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
    assert.equal(response.body().code, 'ADMS.AUTHZ.002')
  })

  test('con permiso el perfil y el avance responden; el reset pone todo en cero', async ({
    client,
    assert,
  }) => {
    for (const slug of ['read-health', 'reset-upload-progress']) {
      const id = await grantToRole(fixture.own.user.roleId, slug)
      if (id !== null) grantedIds.push(id)
    }

    const profile = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/profile`)
      .loginAs(fixture.own.user)
      .header('X-Business-Unit-Id', fixture.own.publicId)
    profile.assertStatus(200)
    assert.isTrue(profile.body().data.profile.available)
    assert.equal(profile.body().data.profile.versions.fp, '10')
    assert.notProperty(profile.body().data.profile, 'optionsRaw')

    await TenantContext.runUnscoped(async () => {
      const stamp = new AccessPointStamp()
      stamp.accessPointId = accessPoint.accessPointId
      stamp.businessUnitId = fixture.own.businessUnitId
      stamp.accessPointStampTable = 'ATTLOG'
      stamp.accessPointStampValue = '9999'
      stamp.accessPointStampLastUploadAt = DateTime.utc()
      stamp.accessPointStampLastUploadLines = 1
      await stamp.save()
    }, 'stamp de prueba')

    const progress = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/upload-progress`)
      .loginAs(fixture.own.user)
      .header('X-Business-Unit-Id', fixture.own.publicId)
    progress.assertStatus(200)
    const rows = progress.body().data.uploadProgress as Array<{ table: string; value: string }>
    assert.lengthOf(rows, 5)
    assert.equal(rows.find((row) => row.table === 'ATTLOG')?.value, '9999')
    assert.equal(rows.find((row) => row.table === 'BIODATA')?.value, '0')

    const reset = await client
      .post(`/api/v1/access-points/${accessPoint.accessPointId}/upload-progress/reset`)
      .loginAs(fixture.own.user)
      .header('X-Business-Unit-Id', fixture.own.publicId)
    reset.assertStatus(200)
    const after = reset.body().data.uploadProgress as Array<{
      table: string
      value: string
      resetByUserId: number | null
    }>
    assert.isTrue(after.every((row) => row.value === '0'))
    assert.equal(after[0].resetByUserId, fixture.own.user.userId)
  })

  test('un usuario de otra empresa recibe 404 sobre el mismo id', async ({ client, assert }) => {
    if (!fixture.foreign) {
      assert.isNull(
        fixture.foreign,
        'solo hay una empresa con usuario; el aislamiento no es comprobable aqui'
      )
      return
    }
    const id = await grantToRole(fixture.foreign.user.roleId, 'read-health')
    if (id !== null) grantedIds.push(id)
    const response = await client
      .get(`/api/v1/access-points/${accessPoint.accessPointId}/profile`)
      .loginAs(fixture.foreign.user)
      .header('X-Business-Unit-Id', fixture.foreign.publicId)
    response.assertStatus(404)
    assert.equal(response.body().key, 'punto-acceso-no-encontrado')
  })

  test('id no numerico responde 400 con datos-invalidos', async ({ client, assert }) => {
    const response = await client
      .get('/api/v1/access-points/abc/profile')
      .loginAs(fixture.own.user)
      .header('X-Business-Unit-Id', fixture.own.publicId)
    if (response.status() === 403) {
      assert.equal(response.body().key, 'sin-permiso')
      return
    }
    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-invalidos')
  })
})
