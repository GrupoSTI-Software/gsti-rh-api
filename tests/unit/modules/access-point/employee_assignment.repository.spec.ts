import { test } from '@japa/runner'
import EmployeeAssignmentRepositoryMysql from '#modules/access-point/employee-assignment/employee_assignment.repository.mysql'
import {
  createSharedAccessPointFixture,
  type SharedFixture,
} from '#tests/helpers/shared_access_point_fixture'

/**
 * El checador se lee sin el mixin (el compartido tambien cuenta): sin alcance
 * de peticion no hay segunda barrera, asi que un alcance vacio falla cerrado.
 */
test.group('EmployeeAssignmentRepositoryMysql.accessPointScope', (group) => {
  let fx: SharedFixture
  group.setup(async () => {
    fx = await createSharedAccessPointFixture()
    return () => fx.cleanup()
  })

  test('con alcance vacio el checador se comporta como inexistente', async ({ assert }) => {
    const repository = new EmployeeAssignmentRepositoryMysql()
    assert.isNull(await repository.accessPointScope(fx.accessPoint.accessPointId, []))
  })

  test('con la invitada en el alcance devuelve a todos los participantes', async ({ assert }) => {
    const repository = new EmployeeAssignmentRepositoryMysql()
    assert.deepEqual(await repository.accessPointScope(fx.accessPoint.accessPointId, [fx.guestBu]), [
      fx.ownerBu,
      fx.guestBu,
    ])
  })

  test('una empresa ajena no lo ve', async ({ assert }) => {
    const repository = new EmployeeAssignmentRepositoryMysql()
    assert.isNull(
      await repository.accessPointScope(fx.accessPoint.accessPointId, [fx.outsiderBu])
    )
  })
})
