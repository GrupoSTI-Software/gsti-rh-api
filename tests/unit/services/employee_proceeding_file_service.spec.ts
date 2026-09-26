import { test } from '@japa/runner'
import Employee from '#models/employee'
import EmployeeProceedingFileService from '#services/employee_proceeding_file_service'

/**
 * Tests unitarios — USRH1783372659486 (defensa en profundidad en expedientes).
 *
 * `EmployeeProceedingFileService.create/update` deben resolver `businessUnitId`
 * únicamente desde el empleado padre (nunca desde el cliente), y `Employee.query()`
 * ya está acotado por `withBusinessUnitScope`: un `employeeId` fuera del scope del
 * usuario autenticado resuelve a `null` ahí, por lo que create/update deben
 * devolver `null` sin persistir nada — sin necesitar base de datos real, se
 * simula el resultado de `Employee.query()` para aislar la lógica del servicio.
 */

/** Reemplaza temporalmente `Employee.query` con un query builder falso. */
function stubEmployeeQuery(result: { businessUnitId: number } | null) {
  const original = Employee.query
  const fakeQuery = {
    whereNull: () => fakeQuery,
    where: () => fakeQuery,
    first: async () => result,
  }
  ;(Employee as unknown as { query: () => typeof fakeQuery }).query = () => fakeQuery
  return () => {
    ;(Employee as unknown as { query: typeof original }).query = original
  }
}

test.group('EmployeeProceedingFileService.create — scope del empleado padre', (group) => {
  let restore: () => void

  group.each.teardown(() => {
    if (restore) restore()
  })

  test('devuelve null (sin persistir) si el empleado no resuelve en el scope del actor', async ({ assert }) => {
    restore = stubEmployeeQuery(null)
    const service = new EmployeeProceedingFileService()

    const result = await service.create({
      employeeId: 999,
      proceedingFileId: 1,
    } as any)

    assert.isNull(result)
  })
})

test.group('EmployeeProceedingFileService.update — sincroniza scope si cambia el padre', (group) => {
  let restore: () => void

  group.each.teardown(() => {
    if (restore) restore()
  })

  test('devuelve null si el nuevo employeeId no resuelve en el scope del actor', async ({ assert }) => {
    restore = stubEmployeeQuery(null)
    const service = new EmployeeProceedingFileService()

    const current = {
      employeeId: 10,
      businessUnitId: 3,
      proceedingFileId: 1,
      save: async () => {
        throw new Error('save() no debería llamarse cuando el nuevo padre está fuera de scope')
      },
    } as any

    const result = await service.update(current, {
      employeeId: 999, // distinto al actual -> dispara la resolución
      proceedingFileId: 1,
    } as any)

    assert.isNull(result)
  })

  test('no re-resuelve el scope si employeeId no cambia', async ({ assert }) => {
    let queried = false
    const originalQuery = Employee.query
    ;(Employee as unknown as { query: () => any }).query = () => {
      queried = true
      return { whereNull: () => ({ where: () => ({ first: async () => null }) }) }
    }
    restore = () => {
      ;(Employee as unknown as { query: typeof originalQuery }).query = originalQuery
    }

    const service = new EmployeeProceedingFileService()
    const current = {
      employeeId: 10,
      businessUnitId: 3,
      proceedingFileId: 1,
      save: async () => {},
    } as any

    const result = await service.update(current, {
      employeeId: 10, // mismo empleado -> no debe consultar Employee de nuevo
      proceedingFileId: 2,
    } as any)

    assert.isFalse(queried, 'no debe re-resolver la BU si el empleado padre no cambió')
    assert.isNotNull(result)
    assert.equal(current.proceedingFileId, 2)
  })
})
