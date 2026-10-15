import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Assist from '#models/assist'
import AccessPointStamp from '#models/access_point_stamp'
import AccessPointEmployee from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import DeviceCommand from '#models/device_command'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import { TenantContext } from '#utils/tenant_context'
import PhotoPublicationService from '#modules/biometric-vault/photo/photo_publication.service'
import DeviceCommandRepositoryMysql from '#modules/device-commands/device_command.repository.mysql'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import type { CommandInsert } from '#modules/device-commands/device_command.repository'
import AccessPointScopeRepositoryMysql from '#modules/access-point/sharing/access_point_scope.repository.mysql'
import type { AccessPointScopePort } from '#modules/access-point/sharing/access_point_scope.port'
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
        .where('employee_id', fx.ownerEmployee.employeeId)
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
    const setStatus = (status: string) =>
      unscoped(() =>
        AccessPointEmployee.query()
          .where('access_point_id', fx.accessPoint.accessPointId)
          .where('employee_id', fx.guestEmployee.employeeId)
          .update({ access_point_employee_sync_status: status })
      )
    await setStatus('revoking')
    try {
      await attlog(`${fx.guestPin}\t${at(50, zone)}\t0\t1\t0\t0\n`)
      const assist = await unscoped(() =>
        Assist.query()
          .where('assist_terminal_sn', fx.accessPoint.accessPointSerialNumber as string)
          .where('assist_emp_id', fx.guestEmployee.employeeId)
          .orderBy('assist_id', 'desc')
          .firstOrFail()
      )
      assert.equal(assist.businessUnitId, fx.guestBu)
    } finally {
      await setStatus('confirmed')
    }
  })

  test('la invitada puede encolar y una ajena del grupo no', async ({ assert }) => {
    const repo = new DeviceCommandRepositoryMysql()
    const stamp = Date.now()
    const base: CommandInsert = {
      accessPointId: fx.accessPoint.accessPointId,
      businessUnitId: fx.guestBu,
      kind: DEVICE_COMMAND_KIND.USER_UPSERT,
      payload: `DATA UPDATE USERINFO PIN=${fx.guestPin}`,
      pin: fx.guestPin,
      bioNo: null,
      priority: 0,
      maxAttempts: null,
      employeeId: fx.guestEmployee.employeeId,
      accessPointEmployeeId: null,
      correlationKey: `test-share-${stamp}`,
      requestedByUserId: null,
      biometricTemplateId: null,
      biometricPhotoPublicationId: null,
    }
    // Los comandos de la prueba cuelgan del checador y los borra el cleanup de la fixture.
    const ok = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
      repo.enqueueIdempotent(base, [stamp * 10 + 1])
    )
    assert.isNotNull(ok)
    assert.isTrue(ok?.created)
    assert.equal(ok?.command.businessUnitId, fx.guestBu)
    await assert.rejects(async () => {
      await TenantContext.run([fx.outsiderBu], () =>
        repo.enqueueIdempotent(
          {
            ...base,
            businessUnitId: fx.outsiderBu,
            employeeId: null,
            correlationKey: `${base.correlationKey}-x`,
          },
          [stamp * 10 + 2]
        )
      )
    }, /no pertenece/)
  })

  /**
   * Dentro de la transaccion del aparato (`outerTrx`), la participacion de la
   * invitada se pregunta en esa misma conexion: pedir otra mientras se
   * retiene la del candado es lo que agotaba el pool.
   */
  test('encolar dentro de la transaccion del aparato revalida la participacion en ella', async ({
    assert,
  }) => {
    const clients: unknown[] = []
    const real = new AccessPointScopeRepositoryMysql()
    const spy = Object.assign(Object.create(real) as AccessPointScopePort, {
      isParticipant: (accessPointId: number, businessUnitId: number, client?: unknown) => {
        clients.push(client)
        return real.isParticipant(
          accessPointId,
          businessUnitId,
          client as Parameters<AccessPointScopePort['isParticipant']>[2]
        )
      },
    })
    const repo = new DeviceCommandRepositoryMysql(spy)
    const stamp = Date.now()
    const outerTrx = await db.transaction()
    try {
      const result = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
        repo.enqueueIdempotent(
          {
            accessPointId: fx.accessPoint.accessPointId,
            businessUnitId: fx.guestBu,
            kind: DEVICE_COMMAND_KIND.USER_UPSERT,
            payload: `DATA UPDATE USERINFO PIN=${fx.guestPin}`,
            pin: fx.guestPin,
            bioNo: null,
            priority: 0,
            maxAttempts: null,
            employeeId: fx.guestEmployee.employeeId,
            accessPointEmployeeId: null,
            correlationKey: `test-share-trx-${stamp}`,
            requestedByUserId: null,
            biometricTemplateId: null,
            biometricPhotoPublicationId: null,
          },
          [stamp * 10 + 3],
          outerTrx
        )
      )
      assert.isTrue(result?.created)
      assert.lengthOf(clients, 1)
      assert.strictEqual(clients[0], outerTrx)
    } finally {
      // Nada se confirma: el comando de la prueba no queda en la BD.
      await outerTrx.rollback()
    }
  })

  test('el padron no trata como ajenos a los de la invitada', async ({ assert }) => {
    const statusOf = async () =>
      unscoped(() =>
        AccessPointEmployee.query().where('access_point_id', fx.accessPoint.accessPointId)
      )
    // Alta en vuelo de los dos: el padron los confirma, cada evento con su empresa.
    await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .update({ access_point_employee_sync_status: 'sent' })
    )
    const res = await admsChannelPost(
      `/iclock/cdata?SN=${fx.accessPoint.accessPointSerialNumber}&table=OPERLOG&Stamp=9999`,
      `USER PIN=${fx.ownerPin}\tName=A\tPri=0\tVerify=-1\nUSER PIN=${fx.guestPin}\tName=B\tPri=0\tVerify=-1\n`,
      fx.accessPoint.accessPointChannelSecret
    )
    assert.equal(res.status, 200)
    const pivots = await statusOf()
    assert.isAtLeast(pivots.length, 2)
    for (const pivot of pivots) assert.equal(pivot.accessPointEmployeeSyncStatus, 'confirmed')
    const deletes = await unscoped(() =>
      DeviceCommand.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('device_command_kind', DEVICE_COMMAND_KIND.USER_DELETE)
    )
    assert.lengthOf(deletes, 0)
    for (const pivot of pivots) {
      const events = await unscoped(() =>
        AccessPointEmployeeEvent.query().where(
          'access_point_employee_id',
          pivot.accessPointEmployeeId
        )
      )
      assert.isAbove(events.length, 0)
      for (const event of events) assert.equal(event.businessUnitId, pivot.businessUnitId)
    }
  })

  test('la huella que sube el aparato de un empleado de la invitada es de la invitada', async ({
    assert,
  }) => {
    // La boveda hace upsert por dedo: se usa uno libre para no pisar (ni luego borrar) un
    // template real del empleado.
    const taken = await unscoped(() =>
      db
        .from('biometric_templates')
        .where('employee_id', fx.guestEmployee.employeeId)
        .where('biometric_template_bio_type', 1)
        .select('biometric_template_bio_no')
    )
    const takenNos = new Set(taken.map((row) => Number(row.biometric_template_bio_no)))
    const bioNo = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((no) => !takenNos.has(no))
    assert.isDefined(bioNo, 'el empleado de la invitada no tiene un dedo libre para la prueba')
    const blob = Buffer.from(`share-${Date.now()}-`.repeat(80)).toString('base64').slice(0, 1120)
    const res = await admsChannelPost(
      `/iclock/cdata?SN=${fx.accessPoint.accessPointSerialNumber}&table=BIODATA&Stamp=9999`,
      `BIODATA Pin=${fx.guestPin}\tNo=${bioNo}\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${blob}\n`,
      fx.accessPoint.accessPointChannelSecret
    )
    assert.equal(res.status, 200)
    const rows = await unscoped(() =>
      db
        .from('biometric_templates')
        .where('source_access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', fx.guestEmployee.employeeId)
        .select('business_unit_id')
    )
    assert.isAbove(rows.length, 0)
    for (const row of rows) assert.equal(row.business_unit_id, fx.guestBu)
  })

  test('la foto publicada al empleado de la invitada lleva su empresa', async ({ assert }) => {
    const pivot = await unscoped(() =>
      AccessPointEmployee.query()
        .where('access_point_id', fx.accessPoint.accessPointId)
        .where('employee_id', fx.guestEmployee.employeeId)
        .firstOrFail()
    )
    // Lo publica el flujo del Backoffice con la empresa del colaborador; la fila y su comando
    // cuelgan del checador y los borra el cleanup de la fixture.
    const published = await TenantContext.run([fx.ownerBu, fx.guestBu], () =>
      new PhotoPublicationService().publish({
        businessUnitId: fx.guestEmployee.businessUnitId as number,
        employeeId: fx.guestEmployee.employeeId,
        accessPointId: fx.accessPoint.accessPointId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        pin: fx.guestPin,
        derivativeVersion: 1,
        requestedByUserId: null,
        now: DateTime.utc(),
      })
    )
    assert.equal(published.publication.businessUnitId, fx.guestBu)
  })

  // Va al final del grupo: revisa lo que dejaron las pruebas anteriores. Regla 3.3 de VLRH-P0065:
  // lo del aparato lleva la empresa responsable; lo del empleado, la empresa del empleado.
  test('cada tabla del canal queda con la empresa que le toca', async ({ assert }) => {
    const apId = fx.accessPoint.accessPointId
    const rowsOf = (table: string, apColumn = 'access_point_id') =>
      unscoped(() => db.from(table).where(apColumn, apId).select('*'))

    // Tablas del aparato (todas las que tienen access_point_id y business_unit_id y escribe el canal).
    const deviceTables = [
      'access_point_stamps',
      'access_point_profiles',
      'adms_raw_messages',
      'adms_held_punches',
      'adms_held_biometrics',
      'adms_unmapped_pins',
      'adms_incidents',
    ]
    // Las que esta prueba debe ver con filas, o el chequeo seria vacuo.
    const mustHaveRows = new Set([
      'access_point_stamps',
      'adms_raw_messages',
      'adms_held_punches',
      'adms_unmapped_pins',
    ])
    const withoutRows: string[] = []
    for (const table of deviceTables) {
      const rows = await rowsOf(table)
      for (const row of rows) {
        assert.equal(row.business_unit_id, fx.ownerBu, `${table}: debe llevar la responsable`)
      }
      if (rows.length === 0) withoutRows.push(table)
      if (mustHaveRows.has(table))
        assert.isAbove(rows.length, 0, `${table}: sin filas, prueba vacua`)
    }

    // Tablas del empleado: la empresa de la fila es la del empleado.
    const employeeBu = async (ids: number[]) => {
      const emps = await unscoped(() =>
        db.from('employees').whereIn('employee_id', ids).select('employee_id', 'business_unit_id')
      )
      return new Map<number, number>(emps.map((e) => [e.employee_id, e.business_unit_id]))
    }
    const employeeTables: Array<{ table: string; apColumn: string; must: boolean }> = [
      { table: 'access_point_employees', apColumn: 'access_point_id', must: true },
      { table: 'device_commands', apColumn: 'access_point_id', must: false },
      { table: 'biometric_templates', apColumn: 'source_access_point_id', must: true },
      { table: 'biometric_photo_publications', apColumn: 'access_point_id', must: true },
    ]
    for (const { table, apColumn, must } of employeeTables) {
      const all = await rowsOf(table, apColumn)
      // device_commands sin employee_id son del aparato/sistema, no del empleado.
      const rows = all.filter((r) => r.employee_id !== null && r.employee_id !== undefined)
      const owners = await employeeBu(rows.map((r) => r.employee_id as number))
      for (const row of rows) {
        assert.equal(
          row.business_unit_id,
          owners.get(row.employee_id),
          `${table}: debe llevar la empresa del empleado ${row.employee_id}`
        )
      }
      if (rows.length === 0) withoutRows.push(table)
      if (must) assert.isAbove(rows.length, 0, `${table}: sin filas, prueba vacua`)
    }

    // Checadas del empleado (assists) de este checador.
    const assists = await unscoped(() =>
      db
        .from('assists')
        .where('assist_terminal_sn', fx.accessPoint.accessPointSerialNumber as string)
        .select('assist_emp_id', 'business_unit_id')
    )
    assert.isAbove(assists.length, 0, 'assists: sin filas, prueba vacua')
    const assistOwners = await employeeBu(assists.map((a) => a.assist_emp_id as number))
    for (const a of assists) assert.equal(a.business_unit_id, assistOwners.get(a.assist_emp_id))

    // Ambas empresas deben aparecer en las tablas del empleado (si no, no se probo la particion).
    const pivots = await rowsOf('access_point_employees')
    assert.sameMembers(
      [...new Set(pivots.map((p) => p.business_unit_id))],
      [fx.ownerBu, fx.guestBu]
    )

    // Solo estas pueden quedar vacias: ninguna prueba del grupo provoca sus escrituras.
    const allowedEmpty = ['adms_held_biometrics', 'adms_incidents']
    for (const table of withoutRows) {
      assert.include(allowedEmpty, table, `${table}: sin filas, prueba vacua`)
    }
  })
})
