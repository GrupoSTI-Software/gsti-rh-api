import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { mirrorUserEmailToRecord, type EmailMirrorActor } from '#helpers/person_user_email_mirror'
import Employee from '#models/employee'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import EmployeeSalaryHistoryService from '#services/employee_salary_history_service'
import UserService from '#services/user_service'
import {
  businessUnitHeader,
  cleanupMirrorWorld,
  countSalaryHistory,
  createEmployeeFor,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  employeeBody,
  personBody,
  readPersonEmail,
  readPersonFirstname,
  readUserRow,
  stamp,
  userBody,
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

test.group('Atomicidad — las cuatro entradas (CA-9)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('PUT /api/persons: el conflicto revierte también el nombre', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-p-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const email = `at-p-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(personBody(person, { personEmail: ocupado, personFirstname: 'Revertido' }))

    response.assertStatus(400)
    assert.equal(await readPersonEmail(person.personId), email)
    assert.equal(await readPersonFirstname(person.personId), 'Espejo')
  })

  test('POST /api/users: el conflicto no deja cuenta ni pivote', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-u-${stamp()}@x.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)

    const response = await client
      .post('/api/users')
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json({ userEmail: ocupado, userActive: true, roleId: w.full.role.roleId, personId: person.personId, userEmailType: 'personal' })

    response.assertStatus(400)
    assert.isNull(await User.query().withTrashed().where('person_id', person.personId).first())
  })

  test('PUT /api/users: el conflicto deja la credencial como estaba', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-uu-${stamp()}@x.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const email = `at-uu-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(userBody(user, { userEmail: ocupado }))

    response.assertStatus(400)
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, email)
  })

  test('PUT /api/employees: el conflicto revierte el salario y su historial', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-e-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const email = `at-e-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'institutional' })
    const employeeBefore = await Employee.findOrFail(employee.employeeId)
    const salaryBefore = employeeBefore.dailySalary
    const historyBefore = await countSalaryHistory(employee.employeeId)

    const response = await client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, { employeeBusinessEmail: ocupado, dailySalary: 999.5, salaryChangeReason: 'Prueba de atomicidad' }))

    response.assertStatus(400)
    const after = await Employee.findOrFail(employee.employeeId)
    assert.equal(after.employeeBusinessEmail, email)
    assert.equal(after.dailySalary, salaryBefore)
    assert.equal(await countSalaryHistory(employee.employeeId), historyBefore)
  })
})

test.group('Atomicidad — CA-13 el-403-de-dato-sensible-revierte-la-credencial', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('por HTTP: sin permiso de contacto, 403 y el correo de acceso queda como estaba', async ({ client, assert }) => {
    const w = world!
    const email = `ca13-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.limited.user)
      .headers(businessUnitHeader(w.limited.businessUnit))
      .json(userBody(user, { userEmail: `ca13-n-${stamp()}@x.com`, userEmailType: 'personal' }))

    response.assertStatus(403)
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, email)
  })

  test('una negativa DESPUÉS de escribir la credencial la revierte', async ({ assert }) => {
    const w = world!
    const email = `ca13b-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })
    const actor: EmailMirrorActor = { userId: w.full.user.userId, businessUnitScope: [w.full.businessUnit.businessUnitId], i18n: i18nManager.locale('es') }

    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await User.findOrFail(user.userId, { client: trx })
        const previousCredentialEmail = current.userEmail
        const nuevo = `ca13b-n-${stamp()}@x.com`
        const updated = await new UserService(i18nManager.locale('es')).update(
          current,
          { userEmail: nuevo, userActive: 1, roleId: user.roleId, personId: user.personId, userEmailType: 'personal' } as User,
          trx
        )
        await mirrorUserEmailToRecord({
          personId: updated.personId,
          userEmail: updated.userEmail,
          userEmailType: updated.userEmailType,
          previousCredentialEmail,
          actor,
          trx,
        })
        // La negativa del guard de `Person` llega aquí en producción.
        throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'contacto')
      })
    )
    const userRow = await readUserRow(user.userId)
    assert.equal(userRow.user_email, email)
    assert.equal(await readPersonEmail(person.personId), email)
  })
})
