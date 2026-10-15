import { test } from '@japa/runner'
import AccessPoint from '#models/access_point'
import AccessPointEmployee from '#models/access_point_employee'
import BusinessUnit from '#models/business_unit'
import DeviceCommand from '#models/device_command'
import Employee from '#models/employee'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import db from '@adonisjs/lucid/services/db'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import ReplicationService from '#modules/biometric-vault/replication/replication.service'
import ConsentGate from '#modules/biometric-vault/consent/consent_gate'
import type { ConsentRecord } from '#modules/biometric-vault/consent/consent_gate.repository'
import { REPLICATION_SKIP } from '#modules/biometric-vault/replication/replication.types'
import { DateTime } from 'luxon'
import {
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  type UnitUser,
} from '#tests/helpers/tenant_actor'
import {
  anotherLiveEmployee,
  createSharedAccessPointFixture,
  seedUnmappedPin,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

const unscoped = <T>(fn: () => Promise<T>) =>
  TenantContext.runUnscoped(async () => await fn(), TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)

let commandSeq = 0

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

  /**
   * Comando pendiente en el checador de la fixture, a nombre de la empresa
   * dada. Lo borra el cleanup de la fixture (cuelga de su `access_point_id`).
   */
  const pendingCommand = async (
    businessUnitId: number,
    employeeId: number,
    pin: string
  ): Promise<DeviceCommand> => {
    commandSeq += 1
    const stamp = Date.now() * 100 + commandSeq
    const result = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
      new DeviceCommandRepositoryMysql().enqueueIdempotent(
        {
          accessPointId: fx.accessPoint.accessPointId,
          businessUnitId,
          kind: DEVICE_COMMAND_KIND.USER_DELETE,
          payload: `DATA DELETE USERINFO PIN=${pin}`,
          pin,
          bioNo: null,
          priority: 0,
          maxAttempts: null,
          employeeId,
          accessPointEmployeeId: null,
          correlationKey: `test-share-bo-${stamp}`,
          requestedByUserId: null,
          biometricTemplateId: null,
          biometricPhotoPublicationId: null,
        },
        [stamp]
      )
    )
    if (!result) throw new Error('No se pudo encolar el comando de prueba')
    return result.command
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

  test('replicar a un checador donde la empresa del empleado no participa es 404 y el servicio lo salta', async ({
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

      // La regla vive tambien en el servicio (el canal y el alta lo llaman sin pasar
      // por el controlador): el destino ajeno se salta y el reparto sigue con los demas.
      class GrantedConsent extends ConsentGate {
        async assertGranted(): Promise<ConsentRecord> {
          return {
            userConsentId: 0,
            legalDocumentId: 0,
            channel: 'physical',
            grantedAt: DateTime.utc(),
          }
        }
      }
      const service = new ReplicationService(
        undefined,
        undefined,
        undefined,
        undefined,
        new GrantedConsent()
      )
      const result = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
        service.replicate({
          employeeId: fx.guestEmployee.employeeId,
          businessUnitId: fx.guestBu,
          sourceAccessPointId: null,
          targetAccessPointIds: [foreignAp.accessPointId, fx.accessPoint.accessPointId],
          modalities: ['fingerprint'],
          actor: { userId: null, ip: '127.0.0.1', userAgent: null, requestId: null },
          dryRun: true,
        })
      )
      assert.lengthOf(result.targets, 2)
      const [foreign, shared] = result.targets
      assert.equal(foreign.accessPointId, foreignAp.accessPointId)
      assert.equal(foreign.accessPointName, '')
      assert.deepEqual(
        foreign.items.map((item) => item.reason),
        [REPLICATION_SKIP.NOT_PARTICIPANT]
      )
      assert.equal(shared.accessPointId, fx.accessPoint.accessPointId)
      assert.notInclude(
        shared.items.map((item) => item.reason),
        REPLICATION_SKIP.NOT_PARTICIPANT
      )
    } finally {
      await unscoped(() =>
        AccessPoint.query().where('access_point_id', foreignAp.accessPointId).delete()
      )
    }
  })

  test('la responsable no puede cancelar un comando del personal de la invitada', async ({
    client,
  }) => {
    const command = await pendingCommand(fx.guestBu, fx.guestEmployee.employeeId, fx.guestPin)
    const actor = await actorFor(fx.ownerBu)
    const res = await client
      .post(
        `/api/v1/access-points/${fx.accessPoint.accessPointId}/commands/${command.deviceCommandId}/cancel`
      )
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(404)
    res.assertBodyContains({ key: 'comando-no-encontrado' })
  })

  test('la responsable si cancela un comando de su personal', async ({ client }) => {
    const command = await pendingCommand(fx.ownerBu, fx.ownerEmployee.employeeId, fx.ownerPin)
    const actor = await actorFor(fx.ownerBu)
    const res = await client
      .post(
        `/api/v1/access-points/${fx.accessPoint.accessPointId}/commands/${command.deviceCommandId}/cancel`
      )
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
  })

  test('la invitada solo lista sus comandos y no cancela los de la responsable', async ({
    client,
    assert,
  }) => {
    const own = await pendingCommand(fx.guestBu, fx.guestEmployee.employeeId, fx.guestPin)
    const foreign = await pendingCommand(fx.ownerBu, fx.ownerEmployee.employeeId, fx.ownerPin)
    const actor = await actorFor(fx.guestBu)

    const list = await client
      .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/commands`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    list.assertStatus(200)
    const ids = (list.body().data.commands as Array<{ id: number }>).map((row) => row.id)
    assert.include(ids, own.deviceCommandId)
    assert.notInclude(ids, foreign.deviceCommandId)
    const businessUnits = await unscoped(async () => {
      const rows = await DeviceCommand.query().whereIn('device_command_id', ids)
      return [...new Set(rows.map((row) => row.businessUnitId))]
    })
    assert.deepEqual(businessUnits, [fx.guestBu])

    const cancel = await client
      .post(
        `/api/v1/access-points/${fx.accessPoint.accessPointId}/commands/${foreign.deviceCommandId}/cancel`
      )
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    cancel.assertStatus(404)
    cancel.assertBodyContains({ key: 'comando-no-encontrado' })
  })

  test('la responsable ve el padron completo del aparato', async ({ client, assert }) => {
    const actor = await actorFor(fx.ownerBu)
    const res = await client
      .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/employees`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const ids = (res.body().data.employees as Array<{ employeeId: number }>).map(
      (row) => row.employeeId
    )
    assert.include(ids, fx.ownerEmployee.employeeId)
    assert.include(ids, fx.guestEmployee.employeeId)
  })

  test('la ficha del empleado de la invitada muestra el checador compartido', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/v1/employees/${fx.guestEmployee.employeeId}/access-points`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const ids = (
      res.body().data.employeeDevices.accessPoints as Array<{ accessPointId: number }>
    ).map((row) => row.accessPointId)
    assert.include(ids, fx.accessPoint.accessPointId)
  })

  test('retirar el rostro de un empleado de la invitada alcanza el checador compartido', async ({
    client,
    assert,
  }) => {
    const employee = await anotherLiveEmployee(fx.guestBu, [fx.guestEmployee.employeeId])
    const setup = await unscoped(async () => {
      let pivot = await AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', employee.employeeId)
        .first()
      if (!pivot) {
        pivot = new AccessPointEmployee()
        pivot.accessPointId = fx.accessPoint.accessPointId
        pivot.employeeId = employee.employeeId
        pivot.businessUnitId = fx.guestBu
        pivot.accessPointEmployeePin = '77'
        pivot.accessPointEmployeeSyncStatus = 'confirmed'
        await pivot.save()
      }
      const face = new EmployeeBiometricFaceId()
      face.employeeId = employee.employeeId
      face.businessUnitId = fx.guestBu
      face.employeeBiometricFaceIdPhotoUrl = `test/share-bo-${Date.now()}.jpg`
      face.employeeBiometricFaceIdDeviceUse = true
      face.employeeBiometricFaceIdDerivativeVersion = 0
      await face.save()
      return { pivot, face }
    })
    try {
      const actor = await actorFor(fx.guestBu)
      const res = await client
        .post(`/api/v1/employees/${employee.employeeId}/device-biometrics/face/disable`)
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
      res.assertStatus(200)

      const command = await unscoped(() =>
        DeviceCommand.query()
          .where('access_point_id', fx.accessPoint.accessPointId)
          .where('employee_id', employee.employeeId)
          .where('device_command_kind', DEVICE_COMMAND_KIND.BIOPHOTO_DELETE)
          .first()
      )
      assert.isNotNull(command)
      assert.equal(command?.businessUnitId, fx.guestBu)
    } finally {
      await unscoped(async () => {
        await db
          .from('biometric_photo_publications')
          .where('employee_id', employee.employeeId)
          .where('access_point_id', fx.accessPoint.accessPointId)
          .delete()
        await db
          .from('employee_biometric_face_ids')
          .where('employee_biometric_face_id_id', setup.face.employeeBiometricFaceIdId)
          .delete()
      })
    }
  })

  test('la invitada ve el PIN no mapeado del aparato y lo reclama con su empleado', async ({
    client,
    assert,
  }) => {
    const pending = await seedUnmappedPin(fx, '9123')
    const actor = await actorFor(fx.guestBu)
    const list = await client
      .get('/api/v1/access-points/unmapped-pins')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    list.assertStatus(200)
    const ids = (list.body().data.unmappedPins as Array<{ unmappedPinId: number }>).map(
      (row) => row.unmappedPinId
    )
    assert.include(ids, pending.admsUnmappedPinId)

    const extra = await anotherLiveEmployee(fx.guestBu, [fx.guestEmployee.employeeId])
    const link = await client
      .post(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/link`)
      .json({ employeeId: extra.employeeId })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    link.assertStatus(200)
    const pivot = await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', extra.employeeId)
        .firstOrFail()
    )
    assert.equal(pivot.businessUnitId, fx.guestBu)
    assert.equal(pivot.accessPointEmployeePin, '9123')
  })

  test('solo la responsable descarta el PIN no mapeado del aparato', async ({
    client,
    assert,
  }) => {
    const pending = await seedUnmappedPin(fx, '9127')
    const guest = await actorFor(fx.guestBu)
    const denied = await client
      .post(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/dismiss`)
      .json({ reason: 'no se de quien es' })
      .loginAs(guest.user.user)
      .header('X-Business-Unit-Id', guest.publicId)
    denied.assertStatus(404)
    denied.assertBodyContains({ key: 'pin-pendiente-no-encontrado' })

    const owner = await actorFor(fx.ownerBu)
    const done = await client
      .post(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/dismiss`)
      .json({ reason: 'no se de quien es' })
      .loginAs(owner.user.user)
      .header('X-Business-Unit-Id', owner.publicId)
    done.assertStatus(200)
    const row = await unscoped(() =>
      db
        .from('adms_unmapped_pins')
        .where('adms_unmapped_pin_id', pending.admsUnmappedPinId)
        .select('adms_unmapped_pin_status')
        .first()
    )
    assert.equal(row?.adms_unmapped_pin_status, 'dismissed')
  })

  test('una empresa ajena no ve ni reclama el PIN no mapeado del aparato', async ({
    client,
    assert,
  }) => {
    const pending = await seedUnmappedPin(fx, '9124')
    const actor = await actorFor(fx.outsiderBu)
    const list = await client
      .get('/api/v1/access-points/unmapped-pins')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    list.assertStatus(200)
    const ids = (list.body().data.unmappedPins as Array<{ unmappedPinId: number }>).map(
      (row) => row.unmappedPinId
    )
    assert.notInclude(ids, pending.admsUnmappedPinId)

    const extra = await anotherLiveEmployee(fx.outsiderBu, [])
    const link = await client
      .post(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/link`)
      .json({ employeeId: extra.employeeId })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    link.assertStatus(404)
  })

  const findAccessPoint = (
    body: { data: { accessPoints: { data: Array<Record<string, unknown>> } } },
    accessPointId: number
  ) => body.data.accessPoints.data.find((row) => row.accessPointId === accessPointId)

  test('la invitada ve el checador compartido con su rol en el catalogo', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get('/api/access-points')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
      .qs({ businessUnitId: fx.guestBu, limit: 500 })
    res.assertStatus(200)
    const row = findAccessPoint(res.body(), fx.accessPoint.accessPointId)
    assert.isDefined(row)
    assert.equal(row?.sharedRole, 'guest')
    assert.isString(row?.sharedBy)
    assert.deepEqual(row?.sharedWith, [])
  })

  test('la responsable ve a la invitada en sharedWith', async ({ client, assert }) => {
    const actor = await actorFor(fx.ownerBu)
    const res = await client
      .get('/api/access-points')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
      .qs({ businessUnitId: fx.ownerBu, limit: 500 })
    res.assertStatus(200)
    const row = findAccessPoint(res.body(), fx.accessPoint.accessPointId)
    assert.equal(row?.sharedRole, 'owner')
    assert.lengthOf(row?.sharedWith as string[], 1)
    assert.isNull(row?.sharedBy)
  })

  test('una empresa ajena no ve el checador compartido en el catalogo', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.outsiderBu)
    const res = await client
      .get('/api/access-points')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
      .qs({ businessUnitId: fx.outsiderBu, limit: 500 })
    res.assertStatus(200)
    assert.isUndefined(findAccessPoint(res.body(), fx.accessPoint.accessPointId))
  })

  test('pedir el catalogo de la responsable desde la invitada no da su vista', async ({
    client,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get('/api/access-points')
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
      .qs({ businessUnitId: fx.ownerBu, limit: 500 })
    // El alcance de la peticion es la empresa del encabezado: otra empresa es 404.
    res.assertStatus(404)
  })

  test('la invitada consulta el checador compartido con su rol', async ({ client, assert }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const row = res.body().data.accessPoint
    assert.equal(row.accessPointId, fx.accessPoint.accessPointId)
    assert.equal(row.sharedRole, 'guest')
    assert.isString(row.sharedBy)
  })

  test('la invitada no recibe la ficha de la responsable ni la red del aparato', async ({
    client,
    assert,
  }) => {
    await unscoped(() =>
      db
        .from('access_points')
        .where('access_point_id', fx.accessPoint.accessPointId)
        .update({ access_point_ip: '10.20.30.40', access_point_mac: 'AA:BB:CC:DD:EE:FF' })
    )
    const guest = await actorFor(fx.guestBu)
    const owner = await actorFor(fx.ownerBu)
    const as = (actor: Actor, url: string, qs: Record<string, number> = {}) =>
      client
        .get(url)
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
        .qs(qs)

    // Ficha: solo el nombre de la responsable, sin IP ni MAC.
    const shown = await as(guest, `/api/access-points/${fx.accessPoint.accessPointId}`)
    shown.assertStatus(200)
    const guestRow = shown.body().data.accessPoint
    assert.deepEqual(Object.keys(guestRow.businessUnit), ['businessUnitName'])
    assert.equal(guestRow.businessUnit.businessUnitName, guestRow.sharedBy)
    assert.isNull(guestRow.accessPointIp)
    assert.isNull(guestRow.accessPointMac)

    // Catalogo: igual.
    const listed = await as(guest, '/api/access-points', { businessUnitId: fx.guestBu, limit: 500 })
    listed.assertStatus(200)
    const listedRow = findAccessPoint(listed.body(), fx.accessPoint.accessPointId) as
      | Record<string, unknown>
      | undefined
    assert.isDefined(listedRow)
    assert.deepEqual(Object.keys(listedRow?.businessUnit ?? {}), ['businessUnitName'])
    assert.isNull(listedRow?.accessPointIp)
    assert.isNull(listedRow?.accessPointMac)

    // Salud individual y de la lista: el compartido aparece, sin IP ni MAC.
    const health = await as(guest, `/api/v1/access-points/${fx.accessPoint.accessPointId}/health`)
    health.assertStatus(200)
    assert.isNull(health.body().data.accessPoint.ip)
    assert.isNull(health.body().data.accessPoint.mac)
    const healthList = await as(guest, '/api/v1/access-points/health')
    healthList.assertStatus(200)
    const sharedHealth = (
      healthList.body().data.accessPoints as Array<{ accessPointId: number; ip: string | null }>
    ).find((row) => row.accessPointId === fx.accessPoint.accessPointId)
    assert.isDefined(sharedHealth)
    assert.isNull(sharedHealth?.ip)

    // La responsable si los ve.
    const ownerShown = await as(owner, `/api/access-points/${fx.accessPoint.accessPointId}`)
    ownerShown.assertStatus(200)
    assert.equal(ownerShown.body().data.accessPoint.accessPointIp, '10.20.30.40')
    const ownerHealth = await as(owner, `/api/v1/access-points/${fx.accessPoint.accessPointId}/health`)
    assert.equal(ownerHealth.body().data.accessPoint.ip, '10.20.30.40')
  })

  test('la invitada recibe 403 al editar o eliminar el checador compartido', async ({
    client,
  }) => {
    const actor = await actorFor(fx.guestBu)
    const update = await client
      .put(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .json({ accessPointName: 'Intento de la invitada', businessUnitId: fx.guestBu })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    update.assertStatus(403)
    update.assertBodyContains({ key: 'solo-lectura-checador-compartido' })

    const destroy = await client
      .delete(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    destroy.assertStatus(403)
    destroy.assertBodyContains({ key: 'solo-lectura-checador-compartido' })
  })

  test('la responsable no puede borrar el checador con invitaciones vivas', async ({
    client,
    assert,
  }) => {
    const owner = await actorFor(fx.ownerBu)
    const res = await client
      .delete(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .loginAs(owner.user.user)
      .header('X-Business-Unit-Id', owner.publicId)
    res.assertStatus(409)
    res.assertBodyContains({ key: 'checador-con-invitaciones-vivas' })
    const body = res.body() as { title?: string; detail?: string }
    assert.isNotEmpty(body.title)
    assert.isNotEmpty(body.detail)
    const alive = await unscoped(() =>
      AccessPoint.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .whereNull('access_point_deleted_at')
        .first()
    )
    assert.isNotNull(alive)
  })

  test('una empresa ajena sigue recibiendo 404 al consultar o editar el checador', async ({
    client,
  }) => {
    const actor = await actorFor(fx.outsiderBu)
    const show = await client
      .get(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    show.assertStatus(404)
    const update = await client
      .put(`/api/access-points/${fx.accessPoint.accessPointId}`)
      .json({ accessPointName: 'Intento ajeno', businessUnitId: fx.outsiderBu })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    update.assertStatus(404)
  })

  test('el padron muestra al empleado ajeno solo con datos de identificacion', async ({
    client,
    assert,
  }) => {
    const actor = await actorFor(fx.ownerBu)
    // Foto privada (llave del bucket) en el empleado de la invitada, restaurada al final.
    const photoRow = await unscoped(() =>
      db
        .from('employees')
        .where('employee_id', fx.guestEmployee.employeeId)
        .select('employee_photo')
        .first()
    )
    const originalPhoto = (photoRow?.employee_photo as string | null) ?? null
    const setPhoto = (value: string | null) =>
      unscoped(() =>
        db
          .from('employees')
          .where('employee_id', fx.guestEmployee.employeeId)
          .update({ employee_photo: value })
      )
    await setPhoto('employees/photos/test-share-private.jpg')
    const res = await (async () => {
      try {
        return await client
          .get(`/api/v1/access-points/${fx.accessPoint.accessPointId}/employees`)
          .loginAs(actor.user.user)
          .header('X-Business-Unit-Id', actor.publicId)
      } finally {
        await setPhoto(originalPhoto)
      }
    })()
    res.assertStatus(200)
    const rows = res.body().data.employees as Array<Record<string, unknown>>
    const foreign = rows.find((row) => row.employeeId === fx.guestEmployee.employeeId)
    assert.isDefined(foreign)
    assert.isTrue(foreign?.foreign)
    assert.sameMembers(Object.keys(foreign ?? {}), [
      'foreign',
      'employeeId',
      'fullName',
      'pin',
      'photoUrl',
      'businessUnitName',
      'syncStatus',
    ])
    assert.equal(foreign?.pin, fx.guestPin)
    assert.isString(foreign?.fullName)
    // Nunca la llave cruda del bucket: una foto privada sale null.
    assert.isNull(foreign?.photoUrl)
    assert.isString(foreign?.businessUnitName)

    const own = rows.find((row) => row.employeeId === fx.ownerEmployee.employeeId)
    assert.isFalse(own?.foreign)
    assert.property(own ?? {}, 'accessPointEmployeeId')
    assert.isString(own?.businessUnitName)
  })

  test('la ficha ofrece a la invitada el checador compartido con sharedBy', async ({
    client,
    assert,
  }) => {
    // Alguien que todavia no este en el aparato (otras pruebas del grupo lo dan de alta).
    const inDevice = await unscoped(async () => {
      const rows = await AccessPointEmployee.query().where(
        'access_point_id',
        fx.accessPoint.accessPointId
      )
      return rows.map((row) => row.employeeId)
    })
    const extra = await anotherLiveEmployee(fx.guestBu, inDevice)
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/v1/employees/${extra.employeeId}/access-points`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const available = res.body().data.employeeDevices.available as Array<{
      accessPointId: number
      sharedBy: string | null
    }>
    const offered = available.find((row) => row.accessPointId === fx.accessPoint.accessPointId)
    assert.isDefined(offered)
    assert.isString(offered?.sharedBy)
  })

  test('la invitada recibe 403 al pedir sincronizacion al aparato', async ({ client }) => {
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .post(`/api/v1/access-points/${fx.accessPoint.accessPointId}/sync`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(403)
    res.assertBodyContains({ key: 'solo-lectura-checador-compartido' })
  })

  test('los candidatos por nombre de la invitada no incluyen a la responsable', async ({
    client,
    assert,
  }) => {
    const pending = await seedUnmappedPin(fx, '9125')
    const owner = await unscoped(() =>
      Employee.query().where('employee_id', fx.ownerEmployee.employeeId).firstOrFail()
    )
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .get(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/candidates`)
      .qs({ search: owner.employeeFirstName })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(200)
    const ids = (res.body().data.candidates as Array<{ employeeId: number }>).map(
      (row) => row.employeeId
    )
    assert.notInclude(ids, fx.ownerEmployee.employeeId)
  })

  test('la invitada no puede vincular un PIN no mapeado a un empleado de la responsable', async ({
    client,
  }) => {
    const pending = await seedUnmappedPin(fx, '9126')
    const actor = await actorFor(fx.guestBu)
    const res = await client
      .post(`/api/v1/access-points/unmapped-pins/${pending.admsUnmappedPinId}/link`)
      .json({ employeeId: fx.ownerEmployee.employeeId })
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(404)
  })

  test('una empresa ajena recibe 404 en una ruta de configuracion', async ({ client }) => {
    const actor = await actorFor(fx.outsiderBu)
    const res = await client
      .post(`/api/v1/access-points/${fx.accessPoint.accessPointId}/clock-sync`)
      .loginAs(actor.user.user)
      .header('X-Business-Unit-Id', actor.publicId)
    res.assertStatus(404)
    res.assertBodyContains({ key: 'punto-acceso-no-encontrado' })
  })

  test('la ex-invitada ve y cierra a mano los vinculos que el aparato no confirmo', async ({
    client,
    assert,
  }) => {
    const own = await createSharedAccessPointFixture()
    try {
      // Invitacion revocada con la baja de su empleado todavia sin confirmar.
      await unscoped(async () => {
        await db
          .from('access_point_shares')
          .where('access_point_share_id', own.share.accessPointShareId)
          .update({ access_point_share_revoked_at: new Date() })
        await AccessPointEmployee.query()
          .where('access_point_id', own.accessPoint.accessPointId)
          .where('employee_id', own.guestEmployee.employeeId)
          .update({ access_point_employee_sync_status: 'revoking' })
      })
      const actor = await actorFor(own.guestBu)

      const list = await client
        .get(`/api/v1/employees/${own.guestEmployee.employeeId}/access-points`)
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
      list.assertStatus(200)
      const ids = (
        list.body().data.employeeDevices.accessPoints as Array<{ accessPointId: number }>
      ).map((row) => row.accessPointId)
      assert.include(ids, own.accessPoint.accessPointId)

      // Operar el aparato ya no: dar de alta a otro empleado es 404.
      const extra = await anotherLiveEmployee(own.guestBu, [own.guestEmployee.employeeId])
      const send = await client
        .post(`/api/access-points/${own.accessPoint.accessPointId}/employee/${extra.employeeId}`)
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
      send.assertStatus(404)

      const forced = await client
        .post(
          `/api/access-points/${own.accessPoint.accessPointId}/employee/${own.guestEmployee.employeeId}/revoke/force`
        )
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
        .json({ reason: 'el equipo no responde' })
      forced.assertStatus(200)
      const pivot = await unscoped(() =>
        AccessPointEmployee.query()
          .where('access_point_id', own.accessPoint.accessPointId)
          .where('employee_id', own.guestEmployee.employeeId)
          .firstOrFail()
      )
      assert.equal(pivot.accessPointEmployeeSyncStatus, 'revoked')
    } finally {
      await own.cleanup()
    }
  })

  test('apagar el rostro de la ex-invitada salta el ex-compartido y llega a su checador propio', async ({
    client,
    assert,
  }) => {
    const own = await createSharedAccessPointFixture()
    const stamp = Date.now()
    let ownAp: AccessPoint | null = null
    let faceIdId: number | null = null
    const employee = await anotherLiveEmployee(own.guestBu, [own.guestEmployee.employeeId])
    try {
      await unscoped(async () => {
        // Checador propio de la invitada; sin perfil, se le puede mandar la foto.
        const ap = new AccessPoint()
        ap.accessPointName = `Propio ${stamp}`
        ap.businessUnitId = own.guestBu
        ap.accessPointActive = 1
        ap.accessPointSerialNumber = `TEST-SHARE-OWN-${stamp}`
        ap.accessPointStatus = 0
        await ap.save()
        ownAp = ap
        const pivotOn = async (accessPointId: number, pin: string, status: 'confirmed' | 'revoking') => {
          const pivot = new AccessPointEmployee()
          pivot.accessPointId = accessPointId
          pivot.employeeId = employee.employeeId
          pivot.businessUnitId = own.guestBu
          pivot.accessPointEmployeePin = pin
          pivot.accessPointEmployeeSyncStatus = status
          await pivot.save()
        }
        await pivotOn(ap.accessPointId, '1', 'confirmed')
        // Invitacion revocada con la baja de la persona sin confirmar en el ex-compartido.
        await pivotOn(own.accessPoint.accessPointId, '78', 'revoking')
        await db
          .from('access_point_shares')
          .where('access_point_share_id', own.share.accessPointShareId)
          .update({ access_point_share_revoked_at: new Date() })
        const face = new EmployeeBiometricFaceId()
        face.employeeId = employee.employeeId
        face.businessUnitId = own.guestBu
        face.employeeBiometricFaceIdPhotoUrl = `test/share-bo-${stamp}.jpg`
        face.employeeBiometricFaceIdDeviceUse = true
        face.employeeBiometricFaceIdDerivativeVersion = 0
        await face.save()
        faceIdId = face.employeeBiometricFaceIdId
      })
      const actor = await actorFor(own.guestBu)
      const res = await client
        .post(`/api/v1/employees/${employee.employeeId}/device-biometrics/face/disable`)
        .loginAs(actor.user.user)
        .header('X-Business-Unit-Id', actor.publicId)
      res.assertStatus(200)

      const ownApId = (ownAp as AccessPoint | null)?.accessPointId
      // Solo los dos checadores de la prueba: otras suites pueden dejar comandos del mismo empleado.
      const deletes = await unscoped(() =>
        DeviceCommand.query()
          .where('employee_id', employee.employeeId)
          .where('device_command_kind', DEVICE_COMMAND_KIND.BIOPHOTO_DELETE)
          .whereIn('access_point_id', [ownApId as number, own.accessPoint.accessPointId])
          .exec()
      )
      assert.sameMembers(
        deletes.map((command) => command.accessPointId),
        [ownApId as number]
      )
      const face = await unscoped(() =>
        EmployeeBiometricFaceId.query()
          .where('employee_biometric_face_id_id', faceIdId as number)
          .firstOrFail()
      )
      assert.isFalse(Boolean(face.employeeBiometricFaceIdDeviceUse))
    } finally {
      await unscoped(async () => {
        const created = ownAp as AccessPoint | null
        if (created) {
          const apId = created.accessPointId
          await db.from('device_commands').where('access_point_id', apId).delete()
          await db.from('biometric_photo_publications').where('access_point_id', apId).delete()
          await db.from('access_point_employees').where('access_point_id', apId).delete()
          await db.from('access_points').where('access_point_id', apId).delete()
        }
        if (faceIdId !== null) {
          await db
            .from('employee_biometric_face_ids')
            .where('employee_biometric_face_id_id', faceIdId)
            .delete()
        }
      })
      await own.cleanup()
    }
  })
})
