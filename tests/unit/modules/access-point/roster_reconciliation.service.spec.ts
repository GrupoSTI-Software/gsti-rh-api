import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { TenantContext } from '#utils/tenant_context'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import DeviceCommand from '#models/device_command'
import RosterReconciliationService from '#modules/access-point/employee-sync/roster_reconciliation.service'

/**
 * Rebanada 8.1: el padron del equipo cierra la baja.
 *
 * Un `Return=0` solo dice que la orden llego. Hasta que el aparato declare su
 * padron no hay prueba de que la aplico, y mientras tanto el PIN queda
 * reservado y las checadas de ese numero se retienen.
 */
const STAMP = `${Date.now()}`
const SERIAL = `TEST-ROSTER-${STAMP}`
const PIN = `7${STAMP.slice(-4)}`

test.group('Reconciliacion del padron (rebanada 8.1)', (group) => {
  let accessPoint: AccessPoint
  let pivot: AccessPointEmployee
  let businessUnitId: number
  let employeeId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; employeeId: number } | null = null
      for (const candidate of pivots) {
        const someone = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .first()
        if (someone) {
          elegido = { unitId: candidate.businessUnitId, employeeId: someone.employeeId }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con colaborador.')
      businessUnitId = elegido.unitId
      employeeId = elegido.employeeId

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de padron ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = SERIAL
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap

      const row = new AccessPointEmployee()
      row.accessPointId = ap.accessPointId
      row.businessUnitId = businessUnitId
      row.employeeId = employeeId
      row.accessPointEmployeePin = PIN
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      row.accessPointEmployeePinSource = 'assigned'
      await row.save()
      pivot = row
    }, 'fixture de reconciliacion de padron')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await db
        .from('access_point_employee_events')
        .where('access_point_employee_id', pivot.accessPointEmployeeId)
        .delete()
      await db.from('adms_incidents').where('access_point_id', accessPoint.accessPointId).delete()
      await db.from('device_commands').where('access_point_id', accessPoint.accessPointId).delete()
      await db
        .from('access_point_employees')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de reconciliacion de padron')
  })

  test('un lote sin lineas USER y sin CHECK previo no concluye nada', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc(),
      })
      assert.equal(result.revoked, 0)
      assert.equal(result.revokeFailed, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED)
  })

  test('el PIN que sigue en el padron delata que la baja no se aplico', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [PIN],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc(),
      })
      assert.equal(result.revokeFailed, 1)
      assert.equal(result.revoked, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(
      fresh.accessPointEmployeeSyncStatus,
      ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED
    )
    assert.isNotNull(fresh.accessPointEmployeeSyncFailureReason)
  })

  test('ausente del padron: la baja quedo aplicada', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        // El equipo declara a alguien mas, pero no a este PIN.
        pins: ['1'],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc().plus({ minutes: 1 }),
      })
      assert.equal(result.revoked, 1)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
  })

  test('un padron anterior a la orden no prueba la baja', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: ['1'],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        // El lote se recibio antes de que el pivote se moviera.
        receivedAt: DateTime.utc().minus({ hours: 1 }),
      })
      assert.equal(result.revoked, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED)
  })

  test('el alta en vuelo se confirma al verla en el padron', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT
      await row.save()

      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [PIN],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc(),
      })
      assert.equal(result.confirmed, 1)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
  })

  test('el padron vacio tras un CHECK cierra la baja', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      /**
       * Un equipo al que le quitaron a todos responde el `CHECK` con un padron
       * sin una sola linea `USER`. Ese silencio es la respuesta, no ruido.
       */
      const check = new DeviceCommand()
      check.accessPointId = accessPoint.accessPointId
      check.businessUnitId = businessUnitId
      check.deviceCommandKind = 'check'
      check.deviceCommandStatus = 'acked'
      check.deviceCommandWireId = Number(`9${STAMP.slice(-6)}`)
      check.deviceCommandPayload = 'CHECK'
      check.deviceCommandAckedAt = DateTime.utc()
      check.deviceCommandAttempts = 1
      await check.save()

      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [],
        hasFingerprints: false,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc().plus({ seconds: 10 }),
      })
      assert.equal(result.revoked, 1)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
  })

  test('un lote de huellas sin usuarios no se lee como padron vacio', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [],
        // Trae biometricos: es una subida, no el padron.
        hasFingerprints: true,
        serial: SERIAL,
        rawMessageId: null,
        receivedAt: DateTime.utc().plus({ seconds: 20 }),
      })
      assert.equal(result.revoked, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED)
  })

  test('el silencio tras el CHECK cierra la baja', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      /**
       * Un equipo sin gente no sube padron: acusa el `CHECK` y calla. Ese
       * silencio, pasado el plazo, es la unica evidencia que va a llegar.
       */
      const check = new DeviceCommand()
      check.accessPointId = accessPoint.accessPointId
      check.businessUnitId = businessUnitId
      check.deviceCommandKind = 'check'
      check.deviceCommandStatus = 'acked'
      check.deviceCommandWireId = Number(`8${STAMP.slice(-6)}`)
      check.deviceCommandPayload = 'CHECK'
      check.deviceCommandAckedAt = DateTime.utc()
      check.deviceCommandAttempts = 1
      await check.save()

      const cerradas = await new RosterReconciliationService().closeSilentRevocations(
        DateTime.utc().plus({ minutes: 11 })
      )
      assert.isAbove(cerradas, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
  })

  test('antes del plazo no se cierra nada: el equipo aun puede contestar', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const row = await AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
      row.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED
      await row.save()

      const cerradas = await new RosterReconciliationService().closeSilentRevocations(
        DateTime.utc().plus({ minutes: 1 })
      )
      assert.equal(cerradas, 0)
    })

    const fresh = await TenantContext.run([businessUnitId], () =>
      AccessPointEmployee.findOrFail(pivot.accessPointEmployeeId)
    )
    assert.equal(fresh.accessPointEmployeeSyncStatus, ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED)
  })
})
