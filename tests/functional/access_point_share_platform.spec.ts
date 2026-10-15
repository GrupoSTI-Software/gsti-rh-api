import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
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
import { admsChannelGet, admsChannelPost } from '#tests/helpers/adms_channel_request'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import PlatformDeviceAssignment from '#models/platform_device_assignment'
import PlatformTenantGroup from '#models/platform_tenant_group'
import PlatformTenantGroupService from '#services/platform_tenant_group_service'
import AccessPointShareService, {
  type ShareGroupWarning,
} from '#modules/access-point/sharing/access_point_share.service'
import AccessPointShareRepositoryMysql from '#modules/access-point/sharing/access_point_share.repository.mysql'
import PlatformDeviceAccessPointService, {
  type AccessPointDeactivateOutcome,
} from '#services/platform_device_access_point_service'
import {
  anotherLiveEmployee,
  commandsOf,
  countTemplates,
  createPlatformConsoleActor,
  createSharedAccessPointFixture,
  enqueuePendingCommandForGuest,
  enqueuePendingUpsertForGuest,
  seedPendingPinPivot,
  sharesUrl,
  type PlatformConsoleActor,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

const unscoped = <T>(fn: () => Promise<T>) =>
  TenantContext.runUnscoped(async () => await fn(), TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

/**
 * Espera a que alguna transaccion de InnoDB quede esperando un candado de fila
 * (`performance_schema.data_lock_waits`; `INNODB_TRX` no lo refleja), o a
 * que `pending` termine sin esperar: asi la prueba de carrera sabe que la otra
 * conexion ya llego al punto de bloqueo (o que nunca lo hara).
 */
const waitForLockWait = async (pending: Promise<unknown>, timeoutMs = 5000): Promise<void> => {
  let settled = false
  void pending.finally(() => {
    settled = true
  })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !settled) {
    const [rows] = (await db.rawQuery(
      'SELECT COUNT(*) AS waiting FROM performance_schema.data_lock_waits'
    )) as [Array<{ waiting: number }>, unknown]
    if (Number(rows[0]?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  if (!settled) throw new Error('Ninguna transaccion llego a esperar el candado')
}

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
    // Copia de biometria de la invitada en cola: tampoco debe salir despues de la baja.
    const biodata = await enqueuePendingCommandForGuest(
      own,
      DEVICE_COMMAND_KIND.BIODATA_WRITE,
      `DATA UPDATE BIODATA Pin=${own.guestPin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=AAAA`
    )
    // Vinculo de la invitada que nunca llego al aparato: se desprende sin encolar.
    const unsentEmployee = await anotherLiveEmployee(own.guestBu, [own.guestEmployee.employeeId])
    const unsent = await seedPendingPinPivot(own, unsentEmployee, own.guestBu)
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
    const biodataAfter = await commandsOf(own, DEVICE_COMMAND_KIND.BIODATA_WRITE)
    assert.lengthOf(biodataAfter, 1)
    assert.equal(biodataAfter[0].deviceCommandId, biodata.deviceCommandId)
    assert.equal(biodataAfter[0].deviceCommandStatus, DEVICE_COMMAND_STATUS.CANCELLED)
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

    // El `pending_pin` queda desprendido, con su evento y sin comandos.
    const detached = await unscoped(() =>
      AccessPointEmployee.query()
        .withTrashed()
        .where('access_point_employee_id', unsent.accessPointEmployeeId)
        .firstOrFail()
    )
    assert.isNotNull(detached.deletedAt)
    const unsentEvents = await unscoped(() =>
      AccessPointEmployeeEvent.query()
        .where('access_point_employee_id', unsent.accessPointEmployeeId)
        .exec()
    )
    assert.lengthOf(unsentEvents, 1)
    const allDeletes = await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE)
    const unsentCommands = allDeletes.filter(
      (command) => command.employeeId === unsentEmployee.employeeId
    )
    assert.lengthOf(unsentCommands, 0)

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

  test('tras revocar, el canal entrega la baja de la ex-invitada y su acuse la cierra', async ({
    client,
    assert,
  }) => {
    const own = await ownFixture()
    const { token } = await consoleToken(client)
    const serial = own.accessPoint.accessPointSerialNumber as string
    const secret = own.accessPoint.accessPointChannelSecret
    const res = await client
      .delete(`${sharesUrl(own)}/${own.share.accessPointShareId}`)
      .bearerToken(token)
    res.assertStatus(200)

    // (a) La cola de la ex-invitada sigue visible para el canal.
    const poll = await admsChannelGet(`/iclock/getrequest?SN=${serial}`, secret)
    assert.equal(poll.status, 200)
    const line = await poll.text()
    assert.include(line, `DATA DELETE USERINFO PIN=${own.guestPin}`)
    const wireId = Number(line.split(':')[1])
    const [sent] = await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE)
    assert.equal(sent.deviceCommandWireId, wireId)
    assert.equal(sent.deviceCommandStatus, DEVICE_COMMAND_STATUS.SENT)

    // (c) El acuse encuentra su comando y el padron sin su PIN cierra el vinculo.
    const ack = await admsChannelPost(
      `/iclock/devicecmd?SN=${serial}`,
      `ID=${wireId}&Return=0&CMD=DATA`,
      secret
    )
    assert.equal(await ack.text(), 'OK')
    const [acked] = await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE)
    assert.equal(acked.deviceCommandStatus, DEVICE_COMMAND_STATUS.ACKED)
    const pivotOf = () =>
      unscoped(() =>
        AccessPointEmployee.query()
          .where('access_point_id', own.accessPoint.accessPointId)
          .where('employee_id', own.guestEmployee.employeeId)
          .firstOrFail()
      )
    const ackedPivot = await pivotOf()
    assert.equal(
      ackedPivot.accessPointEmployeeSyncStatus,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
    )
    // El padron se pide a nombre de la responsable: el aparato es suyo.
    const checks = await commandsOf(own, DEVICE_COMMAND_KIND.CHECK)
    assert.lengthOf(checks, 1)
    assert.equal(checks[0].businessUnitId, own.ownerBu)

    const roster = await admsChannelPost(
      `/iclock/cdata?SN=${serial}&table=OPERLOG&Stamp=9999`,
      `USER PIN=${own.ownerPin}\tName=A\tPri=0\tVerify=-1\n`,
      secret
    )
    assert.equal(roster.status, 200)
    const closedPivot = await pivotOf()
    assert.equal(closedPivot.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
  })

  test('una checada con el PIN de la ex-invitada nunca cae en la responsable', async ({
    client,
    assert,
  }) => {
    const own = await ownFixture()
    const { token } = await consoleToken(client)
    const serial = own.accessPoint.accessPointSerialNumber as string
    const secret = own.accessPoint.accessPointChannelSecret
    // Un empleado de la responsable con codigo igual al PIN de la invitada fuerza el respaldo por codigo.
    // Se usa el empleado de la fixture: la responsable puede no tener otro vivo.
    const decoy = own.ownerEmployee
    const originalCode = decoy.employeeCode
    await unscoped(() =>
      db
        .from('employees')
        .where('employee_id', decoy.employeeId)
        .update({ employee_code: own.guestPin })
    )
    try {
      const res = await client
        .delete(`${sharesUrl(own)}/${own.share.accessPointShareId}`)
        .bearerToken(token)
      res.assertStatus(200)

      const punch = (minutes: number) =>
        admsChannelPost(
          `/iclock/cdata?SN=${serial}&table=ATTLOG&Stamp=9999`,
          `${own.guestPin}\t${DateTime.utc().minus({ minutes }).setZone(own.zone).toFormat('yyyy-MM-dd HH:mm:ss')}\t0\t1\t0\t0\n`,
          secret
        )
      const decoyAssists = () =>
        unscoped(() =>
          Assist.query()
            .where('assist_terminal_sn', serial)
            .where('assist_emp_id', decoy.employeeId)
            .exec()
        )

      // Baja sin confirmar: la checada sigue siendo de la ex-invitada.
      const first = await punch(7)
      assert.equal(first.status, 200)
      const assist = await unscoped(() =>
        Assist.query()
          .where('assist_terminal_sn', serial)
          .where('assist_emp_id', own.guestEmployee.employeeId)
          .orderBy('assist_id', 'desc')
          .firstOrFail()
      )
      assert.equal(assist.businessUnitId, own.guestBu)
      assert.lengthOf(await decoyAssists(), 0)

      // Baja confirmada: se retiene, no se infiere por codigo dentro de la responsable.
      await unscoped(() =>
        AccessPointEmployee.query()
          .where('access_point_id', own.accessPoint.accessPointId)
          .where('employee_id', own.guestEmployee.employeeId)
          .update({ access_point_employee_sync_status: ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED })
      )
      const second = await punch(6)
      assert.equal(second.status, 200)
      assert.lengthOf(await decoyAssists(), 0)
      const inferred = await unscoped(() =>
        AccessPointEmployee.query()
          .where('access_point_id', own.accessPoint.accessPointId)
          .where('employee_id', decoy.employeeId)
          .where('access_point_employee_pin', own.guestPin)
          .exec()
      )
      assert.lengthOf(inferred, 0)
    } finally {
      await unscoped(() =>
        db
          .from('employees')
          .where('employee_id', decoy.employeeId)
          .update({ employee_code: originalCode })
      )
    }
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

  /**
   * Carrera otorgar contra desasignar: el otorgamiento tiene la entrega
   * bloqueada y su invitacion insertada sin confirmar cuando arranca la
   * desasignacion. Esta espera la entrega y, al confirmar el otorgamiento,
   * tiene que verlo y revocarlo: si su primera lectura consistente fuera
   * anterior al candado, la snapshot no tendria la invitacion nueva y la
   * dejaria viva sobre una entrega cerrada.
   */
  test('desasignar revoca una invitacion otorgada mientras esperaba la entrega', async ({
    assert,
  }) => {
    const own = await ownFixture()
    const repository = new AccessPointShareRepositoryMysql()
    const grantTrx = await db.transaction()
    let unassigning: Promise<unknown> | null = null
    try {
      assert.isTrue(await repository.lockOpenAssignment(own.platformDeviceAssignmentId, grantTrx))
      const lateShareId = await repository.insert(
        {
          accessPointId: own.accessPoint.accessPointId,
          businessUnitId: own.outsiderBu,
          platformTenantGroupId: own.groupId,
          grantedAt: DateTime.utc(),
          grantedBy: null,
        },
        grantTrx
      )

      unassigning = new PlatformDeviceAssignmentService()
        .unassign(own.platformDeviceId, {
          releasedAt: new Date(),
          releaseReason: own.releaseReason,
        })
        .catch((error: unknown) => error)
      await waitForLockWait(unassigning)
      await grantTrx.commit()
      const outcome = await unassigning
      assert.notInstanceOf(outcome, Error, String(outcome))

      const late = await unscoped(() =>
        AccessPointShare.query().where('access_point_share_id', lateShareId).firstOrFail()
      )
      assert.isNotNull(late.accessPointShareRevokedAt)
      assert.equal(late.accessPointShareRevokeReason, ACCESS_POINT_SHARE_REVOKE_REASON.UNASSIGNMENT)
    } finally {
      if (!grantTrx.isCompleted) await grantTrx.rollback()
      if (unassigning) await unassigning
    }
  })

  test('si apagar el punto de acceso falla, desasignar no deja bajas en cola ni revoca', async ({
    assert,
  }) => {
    const own = await ownFixture()
    class FailingAccessPointService extends PlatformDeviceAccessPointService {
      async deactivateForDevice(): Promise<AccessPointDeactivateOutcome> {
        throw new Error('falla forzada al apagar el punto de acceso')
      }
    }
    const service = new PlatformDeviceAssignmentService(new FailingAccessPointService())
    let failure: unknown = null
    try {
      await service.unassign(own.platformDeviceId, {
        releasedAt: new Date(),
        releaseReason: own.releaseReason,
      })
    } catch (error) {
      failure = error
    }
    assert.instanceOf(failure, PlatformDeviceServiceError)
    assert.equal(
      (failure as PlatformDeviceServiceError).errorCode,
      PLATFORM_DEVICE_ERROR_CODES.AP_DEACTIVATE_FAILED
    )

    assert.lengthOf(await commandsOf(own, DEVICE_COMMAND_KIND.USER_DELETE), 0)
    const pivot = await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', own.accessPoint.accessPointId)
        .where('employee_id', own.guestEmployee.employeeId)
        .firstOrFail()
    )
    assert.equal(pivot.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
    const share = await unscoped(() =>
      AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .firstOrFail()
    )
    assert.isNull(share.accessPointShareRevokedAt)
    const assignment = await unscoped(() =>
      PlatformDeviceAssignment.query()
        .where('platform_device_assignment_id', own.platformDeviceAssignmentId)
        .firstOrFail()
    )
    assert.isNull(assignment.platformDeviceAssignmentReleasedAt)
  })

  test('otorgar con el grupo apagado es 422', async ({ client }) => {
    const own = await ownFixture()
    const { token } = await consoleToken(client)
    await unscoped(async () => {
      // Se libera la invitacion de la fixture para que la invitada sea candidata.
      await AccessPointShare.query()
        .where('access_point_share_id', own.share.accessPointShareId)
        .update({ access_point_share_revoked_at: new Date() })
      await PlatformTenantGroup.query()
        .where('platform_tenant_group_id', own.groupId)
        .update({ platform_tenant_group_active: 0 })
    })
    const res = await client
      .post(sharesUrl(own))
      .bearerToken(token)
      .json({ businessUnitPublicId: own.guestPublicId })
    res.assertStatus(422)
    res.assertBodyContains({ key: 'empresa-fuera-del-grupo' })
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

  test('si los avisos fallan, dar de baja el grupo responde sin avisos y no se revierte', async ({
    assert,
  }) => {
    const own = await ownFixture()
    class FailingShares extends AccessPointShareService {
      async warningsForGroupExit(): Promise<ShareGroupWarning[]> {
        throw new Error('falla forzada al calcular avisos')
      }
    }
    const result = await new PlatformTenantGroupService(new FailingShares()).deleteGroup(
      own.groupId
    )
    assert.deepEqual(result.warnings, [])
    // La baja quedo hecha: el grupo ya no esta vivo.
    const live = await db
      .from('platform_tenant_groups')
      .where('platform_tenant_group_id', own.groupId)
      .whereNull('platform_tenant_group_deleted_at')
      .first()
    assert.isNull(live ?? null)
  })
})
