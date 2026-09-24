import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import Employee from '#models/employee'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import EmployeeSalaryHistoryService from '#services/employee_salary_history_service'
import UserService from '#services/user_service'
import {
  cleanupMirrorWorld,
  countSalaryHistory,
  createEmployeeFor,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  readUserRow,
  stamp,
  type MirrorWorld,
} from './person_user_email_mirror_support.js'

/**
 * USRH1789698261612 — las dos mitades se guardan juntas o ninguna (regla 7).
 * Cada caso verifica leyendo la fila, no el status.
 */

class ForcedRollback extends Error {}

let world: MirrorWorld | null = null

test.group('Atomicidad — servicios con transacción', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('registrarCambio dentro de una transacción revertida no deja filas', async ({ assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `sal-${stamp()}@empresa.com`)
    const before = await countSalaryHistory(employee.employeeId)
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await new EmployeeSalaryHistoryService().registrarCambio(
          { employeeId: employee.employeeId, salaryDaily: 321.5, changedBy: w.full.user.userId },
          trx
        )
        throw new ForcedRollback('rollback')
      })
    )
    assert.equal(await countSalaryHistory(employee.employeeId), before)
  })

  test('UserService.update dentro de una transacción revertida deja la credencial como estaba', async ({ assert }) => {
    const w = world!
    const email = `svc-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await User.findOrFail(user.userId, { client: trx })
        await new UserService(i18nManager.locale('es')).update(
          current,
          { userEmail: `otro-${email}`, userActive: 1, roleId: user.roleId, personId: user.personId, userEmailType: 'personal' } as User,
          trx
        )
        throw new ForcedRollback('rollback')
      })
    )
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, email)
  })

  test('EmployeeService.update con cambio de salario revertido no deja historial ni correo', async ({ assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const email = `emp-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, email)
    const before = await countSalaryHistory(employee.employeeId)
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await Employee.findOrFail(employee.employeeId, { client: trx })
        const payload = { ...current.serialize(), employeeBusinessEmail: `nuevo-${email}`, dailySalary: 777.25 } as unknown as Employee
        await new EmployeeService(i18nManager.locale('es')).update(current, payload, { changedBy: w.full.user.userId }, trx)
        throw new ForcedRollback('rollback')
      })
    )
    const row = await db.from('employees').where('employee_id', employee.employeeId).select('employee_business_email').first()
    assert.equal(row.employee_business_email, email)
    assert.equal(await countSalaryHistory(employee.employeeId), before)
  })
})
