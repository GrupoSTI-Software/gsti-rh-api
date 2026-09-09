import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import EmployeeAssignmentService from '#modules/access-point/employee-assignment/employee_assignment.service'
import type EmployeeAssignmentRepository from '#modules/access-point/employee-assignment/employee_assignment.repository'
import type { BusinessUnitScope } from '#modules/access-point/employee-assignment/employee_assignment.repository'
import AccessPointEmployeeServiceError from '#exceptions/access_point_employee_service_error'
import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'

/** El i18n real no aporta nada aqui: devuelve la clave y se compara por key. */
const i18n = { formatMessage: (key: string) => key } as unknown as I18n

function assignmentOf(status: AccessPointEmployeeSyncStatus): AccessPointEmployee {
  return {
    accessPointEmployeeId: 3,
    accessPointId: 12,
    employeeId: 77,
    accessPointEmployeePin: '4',
    accessPointEmployeeSyncStatus: status,
  } as unknown as AccessPointEmployee
}

function makeService(assignment: AccessPointEmployee | null) {
  const retiradas: AccessPointEmployee[] = []

  const repository: EmployeeAssignmentRepository = {
    async accessPointExists() {
      return true
    },
    async employeeExists() {
      return true
    },
    async findAssignment(_accessPointId: number, _employeeId: number, _scope: BusinessUnitScope) {
      return assignment
    },
    async createAssignment() {
      return assignmentOf('pending_pin')
    },
    async removeAssignment(target) {
      retiradas.push(target)
    },
  }

  return { service: new EmployeeAssignmentService(i18n, repository), retiradas }
}

async function retirar(status: AccessPointEmployeeSyncStatus) {
  const { service, retiradas } = makeService(assignmentOf(status))
  let capturado: unknown = null
  try {
    await service.remove(12, 77, null)
  } catch (error) {
    capturado = error
  }
  return { capturado, retiradas }
}

test.group('Retirar la asignacion exige la baja en el equipo', () => {
  test('con el alta confirmada se rechaza: la persona sigue en el aparato', async ({ assert }) => {
    const { capturado, retiradas } = await retirar('confirmed')

    assert.instanceOf(capturado, AccessPointEmployeeServiceError)
    const error = capturado as AccessPointEmployeeServiceError
    assert.equal(error.key, 'baja-pendiente-en-el-equipo')
    assert.equal(error.errorCode, 'ACCP.ASSIGN.REVOCATION_REQUIRED')
    assert.equal(error.httpStatus, 409)
    assert.lengthOf(retiradas, 0)
  })

  test('con la baja acusada tampoco: el equipo no ha dicho que la aplico', async ({ assert }) => {
    const { capturado, retiradas } = await retirar('revoke_acked')

    assert.instanceOf(capturado, AccessPointEmployeeServiceError)
    assert.lengthOf(retiradas, 0)
  })

  test('con el alta en cola tampoco: el equipo la recoge al conectarse', async ({ assert }) => {
    const { capturado, retiradas } = await retirar('pending')

    assert.instanceOf(capturado, AccessPointEmployeeServiceError)
    assert.lengthOf(retiradas, 0)
  })

  test('con la baja confirmada si se retira', async ({ assert }) => {
    const { capturado, retiradas } = await retirar('revoked')

    assert.isNull(capturado)
    assert.lengthOf(retiradas, 1)
  })

  test('sin numero asignado si se retira: nunca se encolo nada', async ({ assert }) => {
    const { capturado, retiradas } = await retirar('pending_pin')

    assert.isNull(capturado)
    assert.lengthOf(retiradas, 1)
  })

  test('sin asignacion sigue siendo 404 y no 409', async ({ assert }) => {
    const { service } = makeService(null)
    let capturado: unknown = null
    try {
      await service.remove(12, 77, null)
    } catch (error) {
      capturado = error
    }

    assert.instanceOf(capturado, AccessPointEmployeeServiceError)
    assert.equal((capturado as AccessPointEmployeeServiceError).httpStatus, 404)
  })
})
