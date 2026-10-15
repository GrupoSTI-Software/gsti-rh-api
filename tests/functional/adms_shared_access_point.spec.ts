import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Assist from '#models/assist'
import AccessPointStamp from '#models/access_point_stamp'
import AccessPointEmployee from '#models/access_point_employee'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { admsChannelPost } from '#tests/helpers/adms_channel_request'
import {
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

const RUN_BASE = DateTime.utc().minus({ hours: 3 }).startOf('second')
const at = (offset: number, zone: string) =>
  RUN_BASE.plus({ seconds: offset }).setZone(zone).toFormat('yyyy-MM-dd HH:mm:ss')
const unscoped = <T>(fn: () => Promise<T>) =>
  TenantContext.runUnscoped(async () => await fn(), TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

test.group('Checador compartido: canal ADMS', (group) => {
  let fx: SharedFixture
  let zone: string
  const attlog = (body: string) =>
    admsChannelPost(
      `/iclock/cdata?SN=${fx.accessPoint.accessPointSerialNumber}&table=ATTLOG&Stamp=9999`,
      body,
      fx.accessPoint.accessPointChannelSecret
    )

  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    zone = fx.accessPoint.accessPointTimezone ?? 'America/Mexico_City'
    return () => fx.cleanup()
  })

  test('checada con PIN de la invitada cae en la empresa de la invitada', async ({ assert }) => {
    const res = await attlog(`${fx.guestPin}\t${at(10, zone)}\t0\t1\t0\t0\n`)
    assert.equal(res.status, 200)
    const assist = await unscoped(() =>
      Assist.query()
        .where('assist_terminal_sn', fx.accessPoint.accessPointSerialNumber as string)
        .where('assist_emp_id', fx.guestEmployee.employeeId)
        .orderBy('assist_id', 'desc')
        .firstOrFail()
    )
    assert.equal(assist.businessUnitId, fx.guestBu)
  })

  test('checada con PIN de la responsable cae en la responsable', async ({ assert }) => {
    await attlog(`${fx.ownerPin}\t${at(20, zone)}\t0\t1\t0\t0\n`)
    const assist = await unscoped(() =>
      Assist.query()
        .where('assist_terminal_sn', fx.accessPoint.accessPointSerialNumber as string)
        .where('assist_emp_id', fx.ownerEmployee.employeeId)
        .orderBy('assist_id', 'desc')
        .firstOrFail()
    )
    assert.equal(assist.businessUnitId, fx.ownerBu)
  })

  test('lo del aparato se escribe con la responsable', async ({ assert }) => {
    await attlog(`${fx.guestPin}\t${at(30, zone)}\t0\t1\t0\t0\n`)
    const stamps = await unscoped(() =>
      AccessPointStamp.query().where('access_point_id', fx.accessPoint.accessPointId)
    )
    assert.isAbove(stamps.length, 0)
    for (const stamp of stamps) assert.equal(stamp.businessUnitId, fx.ownerBu)
  })

  test('PIN sin pivote se retiene y queda reclamable', async ({ assert }) => {
    const code = fx.ownerEmployee.employeeCode as string
    await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('access_point_employee_pin', code)
        .delete()
    )
    await attlog(`${code}\t${at(40, zone)}\t0\t1\t0\t0\n`)
    const held = await unscoped(() =>
      AdmsHeldPunch.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('adms_held_punch_pin', code)
        .firstOrFail()
    )
    assert.equal(held.admsHeldPunchReason, 'shared_device_no_pivot')
    assert.equal(held.businessUnitId, fx.ownerBu)
    const unmapped = await unscoped(() =>
      AdmsUnmappedPin.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('adms_unmapped_pin_pin', code)
        .firstOrFail()
    )
    assert.equal(unmapped.businessUnitId, fx.ownerBu)
  })

  test('PIN de invitada con baja pendiente de envio sigue cayendo en la invitada', async ({
    assert,
  }) => {
    // `revoking` es la baja pendiente de envio: no retiene (solo `revoke_acked` lo hace).
    await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', fx.guestEmployee.employeeId)
        .update({ access_point_employee_sync_status: 'revoking' })
    )
    await attlog(`${fx.guestPin}\t${at(50, zone)}\t0\t1\t0\t0\n`)
    const assist = await unscoped(() =>
      Assist.query()
        .where('assist_terminal_sn', fx.accessPoint.accessPointSerialNumber as string)
        .where('assist_emp_id', fx.guestEmployee.employeeId)
        .orderBy('assist_id', 'desc')
        .firstOrFail()
    )
    assert.equal(assist.businessUnitId, fx.guestBu)
    await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', fx.guestEmployee.employeeId)
        .update({ access_point_employee_sync_status: 'confirmed' })
    )
  })
})
