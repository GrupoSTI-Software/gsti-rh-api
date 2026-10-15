import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import AccessPointEmployee, { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import AccessPointShare, { ACCESS_POINT_SHARE_REVOKE_REASON } from '#models/access_point_share'
import Assist from '#models/assist'
import PlatformDeviceAssignmentService from '#services/platform_device_assignment_service'
import PlatformDeviceDiscrepancyService from '#services/platform_device_discrepancy_service'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { admsChannelPost } from '#tests/helpers/adms_channel_request'
import {
  commandsOf,
  countTemplates,
  createPlatformConsoleActor,
  createSharedAccessPointFixture,
  enqueuePendingUpsertForGuest,
  sharesUrl,
  type PlatformConsoleActor,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

const unscoped = <T>(fn: () => Promise<T>) =>
  TenantContext.runUnscoped(async () => await fn(), TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

/**
 * El landlord otorga y revoca invitaciones a un checador y avisa al sacar
 * empresas del grupo (VLRH-P0065, 3.2 y 5; Tarea 10 de VLRH-P0066).
 *
 * Las pruebas que mutan (revocar, desasignar, sacar del grupo) crean su propia
 * fixture para no depender del orden.
 */
test.group('Checador compartido: landlord', (group) => {
  let fx: SharedFixture
  let admin: PlatformConsoleActor | null = null
  const owned: SharedFixture[] = []

  /** Token de consola, creado una vez por grupo (necesita el cliente HTTP). */
  const consoleToken = async (client: ApiClient): Promise<PlatformConsoleActor> => {
    if (!admin) admin = await createPlatformConsoleActor(client)
    return admin
  }

  const ownFixture = async (): Promise<SharedFixture> => {
    const created = await createSharedAccessPointFixture()
    owned.push(created)
    return created
  }

  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return async () => {
      try {
        await fx.cleanup()
      } finally {
        if (admin) await admin.cleanup()
      }
    }
  })

  /**
   * La fixture propia se limpia al terminar su prueba: saca a las empresas del
   * grupo de la fixture compartida y su limpieza las regresa ahi.
   */
  group.each.teardown(async () => {
    while (owned.length > 0) {
      const last = owned.pop() as SharedFixture
      await last.cleanup()
    }
  })

  test('lista la invitacion viva sin candidatos cuando no queda nadie del grupo', async ({
    client,
    assert,
  }) => {
    const { token } = await consoleToken(client)
    const res = await client.get(sharesUrl(fx)).bearerToken(token)
    res.assertStatus(200)
    const body = res.body() as {
      data: {
        items: Array<{
          accessPointShareId: number
          businessUnitPublicId: string
          revokedAt: string | null
          outsideGroup: boolean
        }>
        candidates: Array<{ businessUnitPublicId: string }>
      }
    }
    assert.lengthOf(body.data.items, 1)
    assert.equal(body.data.items[0].accessPointShareId, fx.share.accessPointShareId)
    assert.equal(body.data.items[0].businessUnitPublicId, fx.guestPublicId)
    assert.isNull(body.data.items[0].revokedAt)
    assert.isFalse(body.data.items[0].outsideGroup)
    assert.lengthOf(body.data.candidates, 0)
  })

  test('otorgar a una empresa fuera del grupo es 422', async ({ client }) => {
    const { token } = await consoleToken(client)
    const res = await client
      .post(sharesUrl(fx))
      .bearerToken(token)
      .json({ businessUnitPublicId: fx.outsiderPublicId })
    res.assertStatus(422)
    res.assertBodyContains({ key: 'empresa-fuera-del-grupo' })
  })

  test('otorgar dos veces es 409', async ({ client }) => {
    const { token } = await consoleToken(client)
    const res = await client
      .post(sharesUrl(fx))
      .bearerToken(token)
      .json({ businessUnitPublicId: fx.guestPublicId })
    res.assertStatus(409)
    res.assertBodyContains({ key: 'invitacion-duplicada' })
  })

  test('otorgar a la propia responsable es 409', async ({ client }) => {
    const { token } = await consoleToken(client)
    const res = await client
      .post(sharesUrl(fx))
      .bearerToken(token)
      .json({ businessUnitPublicId: fx.ownerPublicId })
    res.assertStatus(409)
    res.assertBodyContains({ key: 'invitacion-duplicada' })
  })

  test('sin sesion es 401', async ({ client }) => {
    const res = await client.get(sharesUrl(fx))
    res.assertStatus(401)
  })

  test('revocar encola user_delete por cada pivote vivo de la invitada y no toca templates', async ({
    client,
    assert,
  }) => {
    const own = await ownFixture()
    const { token, user } = await consoleToken(client)
    const upsert = await enqueuePendingUpsertForGuest(own) // alta de la invitada todavia en cola
    const templatesBefore = await countTemplates(own.guestEmployee.employeeId)

    const res = await client
      .delete(`${sharesUrl(own)}/${own.share.accessPointShareId}`)
      .bearerToken(token)
    res.assertStatus(200)
    const item = (res.body() as { data: { revokedAt: string | null; revokeReason: string } }).data
    assert.isNotNull(item.revokedAt)
    assert.equal(item.revokeReason, ACCESS_POINT_SHARE_REVOKE_REASON.MANUAL)

    const deletes = await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE)
    assert.lengthOf(deletes, 1)
    assert.equal(deletes[0].businessUnitId, own.guestBu)
    assert.equal(deletes[0].employeeId, own.guestEmployee.employeeId)
    // La baja se encola despues de cerrar el alta: su id es mayor.
    assert.isAbove(deletes[0].deviceCommandId, upsert.deviceCommandId)
    const pendingUpserts = await commandsOf(
      own,
      DEVICE_COMMAND_KIND.USER_UPSERT,
      DEVICE_COMMAND_STATUS.PENDING
    )
    assert.lengthOf(pendingUpserts, 0)
    assert.equal(await countTemplates(own.guestEmployee.employeeId), templatesBefore)

    const share = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .firstOrFail()
    )
    assert.equal(share.accessPointShareRevokedBy, user.userId)
    assert.equal(share.accessPointShareRevokeReason, ACCESS_POINT_SHARE_REVOKE_REASON.MANUAL)

    // Pendiente de la Tarea 7: el pivote queda en baja y su PIN no se reasigna
    // hasta que el aparato confirme, aunque la invitada ya no participe.
    const pivot = await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', own.accessPoint.accessPointId)
        .where('employee_id', own.guestEmployee.employeeId)
        .firstOrFail()
    )
    assert.equal(pivot.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING)
    const taken = await TenantContext.run([own.ownerBu], () =>
      new EmployeeSyncRepositoryMysql().listTakenPins(own.accessPoint.accessPointId)
    )
    assert.include(taken, own.guestPin)

    // Revocada, la invitada vuelve a ser candidata y se le puede otorgar de nuevo.
    const again = await client
      .post(sharesUrl(own))
      .bearerToken(token)
      .json({ businessUnitPublicId: own.guestPublicId })
    again.assertStatus(201)
    const granted = (again.body() as { data: { revokedAt: string | null; grantedAt: string } })
      .data
    assert.isNull(granted.revokedAt)
  })

  test('desasignar la unidad revoca todas las invitaciones en la misma transaccion', async ({
    client,
    assert,
  }) => {
    const own = await ownFixture()
    await new PlatformDeviceAssignmentService().unassign(own.platformDeviceId, {
      releasedAt: new Date(),
      releaseReason: own.releaseReason,
    })

    const live = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_id', own.accessPoint.accessPointId)
        .whereNull('access_point_share_revoked_at')
        .exec()
    )
    assert.lengthOf(live, 0)
    const closed = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .firstOrFail()
    )
    assert.equal(closed.accessPointShareRevokeReason, ACCESS_POINT_SHARE_REVOKE_REASON.UNASSIGNMENT)
    assert.isNull(closed.accessPointShareRevokedBy)

    const deletes = await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE)
    assert.lengthOf(deletes, 1)
    assert.equal(deletes[0].businessUnitId, own.guestBu)

    // Sin entrega vigente ya no se puede otorgar.
    const { token } = await consoleToken(client)
    const res = await client
      .post(sharesUrl(own))
      .bearerToken(token)
      .json({ businessUnitPublicId: own.guestPublicId })
    res.assertStatus(409)
    res.assertBodyContains({ key: 'unidad-sin-asignacion' })
  })

  test('sacar a la invitada del grupo avisa, no revoca y crea discrepancia', async ({
    client,
    assert,
  }) => {
    const own = await ownFixture()
    const { token } = await consoleToken(client)
    const res = await client
      .put(`/api/platform/tenant-groups/${own.groupId}/members`)
      .bearerToken(token)
      .json({ businessUnitPublicIds: [own.ownerPublicId] })
    res.assertStatus(200)
    const warnings = (
      res.body() as {
        data: {
          warnings: Array<{ key: string; businessUnitPublicId: string; accessPointIds: number[] }>
        }
      }
    ).data.warnings
    const warning = warnings.find((w) => w.businessUnitPublicId === own.guestPublicId)
    assert.exists(warning)
    assert.equal(warning!.key, 'invitacion-fuera-del-grupo')
    assert.include(warning!.accessPointIds, own.accessPoint.accessPointId)

    const live = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .firstOrFail()
    )
    assert.isNull(live.accessPointShareRevokedAt)

    const discrepancies = await new PlatformDeviceDiscrepancyService().list()
    assert.isTrue(
      discrepancies.some(
        (d) =>
          d.type === 'INVITACION_FUERA_DEL_GRUPO' &&
          d.accessPointId === own.accessPoint.accessPointId &&
          d.tenantPublicId === own.guestPublicId
      )
    )

    const listed = await client.get(sharesUrl(own)).bearerToken(token)
    listed.assertStatus(200)
    const items = (listed.body() as { data: { items: Array<{ outsideGroup: boolean }> } }).data
      .items
    assert.isTrue(items[0].outsideGroup)

    await admsChannelPost(
      `/iclock/cdata?SN=${own.accessPoint.accessPointSerialNumber}&table=ATTLOG&Stamp=9999`,
      `${own.guestPin}\t${DateTime.utc().minus({ minutes: 5 }).setZone(own.zone).toFormat('yyyy-MM-dd HH:mm:ss')}\t0\t1\t0\t0\n`,
      own.accessPoint.accessPointChannelSecret
    )
    const assist = await unscoped(() =>
      Assist.query()
        .where('assist_terminal_sn', own.accessPoint.accessPointSerialNumber as string)
        .where('assist_emp_id', own.guestEmployee.employeeId)
        .orderBy('assist_id', 'desc')
        .firstOrFail()
    )
    assert.equal(assist.businessUnitId, own.guestBu)
  })

  test('dar de baja el grupo avisa y no revoca', async ({ client, assert }) => {
    const own = await ownFixture()
    const { token } = await consoleToken(client)
    const res = await client
      .delete(`/api/platform/tenant-groups/${own.groupId}`)
      .bearerToken(token)
    res.assertStatus(200)
    const warnings = (
      res.body() as { data: { warnings: Array<{ key: string; businessUnitPublicId: string }> } }
    ).data.warnings
    assert.isTrue(
      warnings.some(
        (w) => w.key === 'invitacion-fuera-del-grupo' && w.businessUnitPublicId === own.guestPublicId
      )
    )
    const live = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .firstOrFail()
    )
    assert.isNull(live.accessPointShareRevokedAt)
  })
})
