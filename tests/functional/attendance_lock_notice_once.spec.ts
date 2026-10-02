import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import AssistsService from '#services/assist_service'
import { reportI18n } from '#helpers/report_locale'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'

/**
 * El bloqueo de asistencia se consulta cada vez que el colaborador intenta
 * checar. El aviso por correo sale una sola vez por colaborador, tipo de
 * bloqueo y mes.
 */

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null

test.group('Bloqueo de asistencia — aviso una vez por mes', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'avisobloqueo')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'avisobloqueo')

    return async () => {
      await db
        .from('attendance_lock_notification_logs')
        .where('employee_id', fixture!.employee.employeeId)
        .delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('solo el primer intento del mes reserva el aviso de cada tipo', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const octubre = DateTime.fromISO('2026-10-01T15:00:00.000Z')
    const noviembre = DateTime.fromISO('2026-11-03T15:00:00.000Z')

    assert.isTrue(await service.claimAttendanceLockNotice(fixture!.employee, 'absences', octubre))
    assert.isFalse(await service.claimAttendanceLockNotice(fixture!.employee, 'absences', octubre))
    assert.isTrue(await service.claimAttendanceLockNotice(fixture!.employee, 'tardiness', octubre))
    assert.isTrue(await service.claimAttendanceLockNotice(fixture!.employee, 'absences', noviembre))
  })
})
