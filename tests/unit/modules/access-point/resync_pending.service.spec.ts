import { test } from '@japa/runner'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import {
  ACCESS_POINT_RESYNC_PENDING_STATUSES,
  ACCESS_POINT_RESYNC_REQUIRED_ACTION,
  requiredActionFor,
} from '#modules/access-point/employee-sync/resync_pending.constants'

/**
 * VLRH-H1790812613831, regla 2: la acción del pendiente sigue al estado ACTUAL
 * del vínculo. Borrado completado → asignar; fallido o en curso → forzar el
 * borrado y luego asignar; cualquier otro ya salió del camino de baja → null.
 */
test.group('requiredActionFor (VLRH-H1790812613831)', () => {
  test('cubre los diez estados del vínculo', ({ assert }) => {
    const expected: Record<string, string | null> = {
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING_PIN]: null,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.PENDING]: null,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.SENT]: null,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED]: null,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.FAILED]: null,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKING]:
        ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT]:
        ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED]:
        ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_FAILED]:
        ACCESS_POINT_RESYNC_REQUIRED_ACTION.FORCE_REVOKE_THEN_ASSIGN,
      [ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED]: ACCESS_POINT_RESYNC_REQUIRED_ACTION.ASSIGN,
    }
    const statuses = Object.values(ACCESS_POINT_EMPLOYEE_SYNC_STATUS)
    assert.lengthOf(statuses, 10)
    for (const status of statuses) {
      assert.equal(requiredActionFor(status), expected[status], status)
    }
  })

  test('los estados que dejan viva la marca son exactamente los que tienen acción', ({
    assert,
  }) => {
    const withAction = Object.values(ACCESS_POINT_EMPLOYEE_SYNC_STATUS).filter(
      (status) => requiredActionFor(status) !== null
    )
    assert.sameMembers([...ACCESS_POINT_RESYNC_PENDING_STATUSES], withAction)
  })
})
