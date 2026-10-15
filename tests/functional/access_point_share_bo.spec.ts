import { test } from '@japa/runner'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import BusinessUnit from '#models/business_unit'
import DeviceCommand from '#models/device_command'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import ReplicationService from '#modules/biometric-vault/replication/replication.service'
import {
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  type UnitUser,
} from '#tests/helpers/tenant_actor'
import {
  anotherLiveEmployee,
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

const unscoped = <T>(fn: () => Promise<T>) =>
  TenantContext.runUnscoped(async () => await fn(), TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

interface Actor {
  user: UnitUser
  /** Valor del encabezado `X-Business-Unit-Id`: el id publico de la empresa. */
  publicId: string
}

/**
 * El Backoffice sobre un checador compartido (VLRH-P0065, 6; Tarea 7 de
 * VLRH-P0066): la invitada opera a su personal en el aparato de la responsable,
 * la configuracion es solo de la responsable y una empresa ajena no lo ve.
 */
test.group('Checador compartido: Backoffice', (group) => {
  let fx: SharedFixture
  const actors: UnitUser[] = []
  const byBu = new Map<number, Actor>()

  /** Usuario `owner` (pasa el gate por salvoconducto) colgado de la empresa. */
  const actorFor = async (businessUnitId: number): Promise<Actor> => {
    const cached = byBu.get(businessUnitId)
    if (cached) return cached
    const actor = await unscoped(async () => {
      const unit = await BusinessUnit.findOrFail(businessUnitId)
      const user = await createBypassUserInBusinessUnit('owner', 'share-bo', businessUnitId)
      return { user, publicId: String(unit.businessUnitPublicId) }
    })
    actors.push(actor.user)
    byBu.set(businessUnitId, actor)
    return actor
  }

  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return async () => {
      try {
        await unscoped(async () => {
          for (const actor of actors) await cleanupUnitUser(actor)
        })
      } finally {
        await fx.cleanup()
      }
    }
  })

  test('la invitada da de alta a su empleado sin chocar PIN con la responsable', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const extra = await anotherLiveEmployee(fx.guestBu, [fx.guestEmployee.employeeId])
    const res = await client
      .post(`/api/access-points/${fx.accessPoint.accessPointId}/employee/${extra.employeeId}`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(201)

    const pivot = await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', extra.employeeId)
        .firstOrFail()
    )
    assert.notInclude([fx.ownerPin, fx.guestPin], pivot.accessPointEmployeePin)
    assert.isAbove(pivot.accessPointEmployeePin.length, 0)
    assert.equal(pivot.businessUnitId, fx.guestBu)
  })

  test('la invitada no puede fijar a su empleado un PIN que ya tiene la responsable', async ({
    client,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .put(
        `/api/access-points/${fx.accessPoint.accessPointId}/employee/${fx.guestEmployee.employeeId}/pin`
      )
      .json({ pin: fx.ownerPin })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(409)
    res.assertBodyContains({ key: 'pin-ocupado' })
  })

  test('el envio de la invitada encola el alta a nombre de su empresa', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .post(
        `/api/access-points/${fx.accessPoint.accessPointId}/employee/${fx.guestEmployee.employeeId}/send`
      )
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)

    const command = await unscoped(() =>
      DeviceCommand.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', fx.guestEmployee.employeeId)
        .where('device_command_kind', DEVICE_COMMAND_KIND.USER_UPSERT)
        .orderBy('device_command_id', 'desc')
        .firstOrFail()
    )
    assert.equal(command.businessUnitId, fx.guestBu)
  })

  test('la invitada no puede tocar a un empleado de la responsable', async ({ client }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .post(
        `/api/access-points/${fx.accessPoint.accessPointId}/employee/${fx.ownerEmployee.employeeId}/revoke`
      )
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(404)
  })

  test('la invitada solo ve a su personal en el padron del checador', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/employees`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const ids = (res.body().data.employees as Array<{ employeeId: number }>).map(
      (row) => row.employeeId
    )
    assert.include(ids, fx.guestEmployee.employeeId)
    assert.notInclude(ids, fx.ownerEmployee.employeeId)
  })

  test('la invitada lee el perfil del aparato', async ({ client }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/profile`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
  })

  test('la invitada recibe 403 al tocar la configuracion del aparato', async ({ client }) => {
    const actor = await actorFor(fx.guestBu)
    const clock = await client
      .post(`/api/v1/access-points/${fx.accessPoint.accessPointId}/clock-sync`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    clock.assertStatus(403)
    clock.assertBodyContains({ key: 'solo-lectura-checador-compartido' })

    const reset = await client
      .post(`/api/v1/access-points/${fx.accessPoint.accessPointId}/upload-progress/reset`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    reset.assertStatus(403)
    reset.assertBodyContains({ key: 'solo-lectura-checador-compartido' })
  })

  test('la responsable si puede pedir la hora del aparato', async ({ client, assert }) => {
    const actor = await actorFor(fx.ownerBu)
    const res = await client
      .post(`/api/v1/access-points/${fx.accessPoint.accessPointId}/clock-sync`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    assert.notEqual(res.status(), 403)
    assert.isBelow(res.status(), 500)
  })

  test('una empresa ajena recibe 404', async ({ client }) => {
    const actor = await actorFor(fx.outsiderBu)
    const res = await client
      .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/employees`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(404)
  })

  test('replicar a un checador donde la empresa del empleado no participa es 404', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const foreignAp = await unscoped(async () => {
      const ap = new AccessPoint()
      ap.accessPointName = `Ajeno ${stamp}`
      ap.businessUnitId = fx.outsiderBu
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = `TEST-SHARE-X-${stamp}`
      ap.accessPointStatus = 0
      await ap.save()
      return ap
    })
    try {
      const actor = await actorFor(fx.guestBu)
      const res = await client
        .post(`/api/v1/employees/${fx.guestEmployee.employeeId}/device-biometrics/replicate`)
        .json({
          sourceAccessPointId: null,
          targetAccessPointIds: [foreignAp.accessPointId],
          modalities: ['fingerprint'],
        })
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
      res.assertStatus(404)

      // La regla vive tambien en el servicio: el canal y el alta lo llaman sin
      // pasar por el controlador.
      const attempt = new ReplicationService().replicate({
        employeeId: fx.guestEmployee.employeeId,
        businessUnitId: fx.guestBu,
        sourceAccessPointId: null,
        targetAccessPointIds: [foreignAp.accessPointId],
        modalities: ['fingerprint'],
        actor: { userId: null, ip: '127.0.0.1', userAgent: null, requestId: null },
        dryRun: true,
      })
      const error = await attempt.then(
        () => null,
        (reason: unknown) => reason as { key?: string; status?: number }
      )
      assert.isNotNull(error)
      assert.equal(error?.key, 'punto-acceso-no-encontrado')
    } finally {
      await unscoped(() =>
        AccessPoint.query().where('access_point_id', foreignAp.accessPointId).delete()
      )
    }
  })
})
