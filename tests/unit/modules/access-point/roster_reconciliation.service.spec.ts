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

  test('un lote sin lineas USER no concluye nada', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const result = await new RosterReconciliationService().reconcile({
        accessPointId: accessPoint.accessPointId,
        businessUnitId,
        pins: [],
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
})
