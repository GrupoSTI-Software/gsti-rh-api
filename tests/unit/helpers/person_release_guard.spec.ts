import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import { ensureRole } from '#tests/helpers/ensure_role'
import { resolvePersonRelease } from '#helpers/person_release_guard'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'

/**
 * USRH1789698261608 — predicado único de liberabilidad de la persona.
 *
 * Contra la BD real (mismo criterio que person_is_collaborator.spec):
 *  - `not-found`: no existe, ya liberada, id no entero o <= 0 (bordes 1-3).
 *  - `linked`: fila en employees / users / customers, viva O dada de baja
 *    (regla 1: haber sido excluye; ahí estaba el agujero).
 *  - `stale`: creada fuera de la ventana, o en el futuro (reglas 2, CA-5).
 *  - `releasable`: sin vínculo alguno y recién creada (regla 5).
 *
 * Las fechas forzadas usan ±2 días para no depender de zona horaria; los
 * bordes finos viven en person_release_constants.spec (predicado puro).
 */
test.group('resolvePersonRelease', (group) => {
  let businessUnitId: number
  const createdPersonIds: number[] = []
  const createdEmployeeIds: number[] = []
  const createdDepartmentIds: number[] = []
  const createdPositionIds: number[] = []
  const createdUserIds: number[] = []
  const createdCustomerIds: number[] = []

  const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

  group.setup(async () => {
    const bu = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .firstOrFail()
    businessUnitId = bu.businessUnitId
  })

  group.teardown(async () => {
    if (createdCustomerIds.length) {
      await db.from('customers').whereIn('customer_id', createdCustomerIds).delete()
    }
    if (createdUserIds.length) {
      await db.from('users').whereIn('user_id', createdUserIds).delete()
    }
    if (createdEmployeeIds.length) {
      await db.from('employees').whereIn('employee_id', createdEmployeeIds).delete()
    }
    if (createdPositionIds.length) {
      await db.from('positions').whereIn('position_id', createdPositionIds).delete()
    }
    if (createdDepartmentIds.length) {
      await db.from('departments').whereIn('department_id', createdDepartmentIds).delete()
    }
    if (createdPersonIds.length) {
      await db.from('people').whereIn('person_id', createdPersonIds).delete()
    }
  })

  async function createPerson(prefix: string): Promise<Person> {
    const person = await Person.create({
      personFirstname: 'Release',
      personLastname: 'Guard',
      personSecondLastname: prefix,
      personEmail: `person-release-${prefix}-${stamp()}@gsti-tests.local`,
    })
    createdPersonIds.push(person.personId)
    return person
  }

  async function setPersonCreatedAt(personId: number, createdAt: DateTime) {
    await db
      .from('people')
      .where('person_id', personId)
      .update({ person_created_at: createdAt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss') })
  }

  async function createEmployeeFor(personId: number, prefix: string, opts?: { softDeleted?: boolean }) {
    const s = stamp()
    const now = new Date()
    const [departmentId] = await db.table('departments').insert({
      department_sync_id: s,
      department_code: `DEP-PRG-${s}`,
      department_name: `Dep ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_active: 1,
      department_created_at: now,
    })
    createdDepartmentIds.push(Number(departmentId))
    const [positionId] = await db.table('positions').insert({
      position_sync_id: s,
      position_code: `POS-PRG-${s}`,
      position_name: `Pos ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    createdPositionIds.push(Number(positionId))
    const [employeeId] = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: `EMP-PRG-${s}`,
      employee_code: `EMP-PRG-${s}`,
      employee_first_name: 'Release',
      employee_last_name: 'Guard',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      payroll_business_unit_id: businessUnitId,
      department_id: Number(departmentId),
      position_id: Number(positionId),
      person_id: personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `emp-prg-${prefix}-${s}@gsti-tests.local`,
      employee_deleted_at: opts?.softDeleted ? now : null,
      employee_created_at: now,
    })
    createdEmployeeIds.push(Number(employeeId))
  }

  async function createUserFor(personId: number, prefix: string, opts?: { softDeleted?: boolean }) {
    const role = await ensureRole('root')
    const user = new User()
    user.userEmail = `user-prg-${prefix}-${stamp()}@gsti-tests.local`
    user.userPassword = 'ReleaseGuardTest123!'
    user.userActive = 1
    user.roleId = role.roleId
    user.personId = personId
    user.userEmailType = 'institutional'
    await user.save()
    createdUserIds.push(user.userId)
    if (opts?.softDeleted) {
      await user.delete()
    }
  }

  async function createCustomerFor(personId: number, opts?: { softDeleted?: boolean }) {
    const now = new Date()
    const [customerId] = await db.table('customers').insert({
      customer_uuid: `cust-prg-${stamp()}`,
      person_id: personId,
      customer_created_at: now,
      customer_deleted_at: opts?.softDeleted ? now : null,
    })
    createdCustomerIds.push(Number(customerId))
  }

  async function personDeletedAt(personId: number): Promise<unknown> {
    const row = await db
      .from('people')
      .where('person_id', personId)
      .select('person_deleted_at')
      .first()
    return row?.person_deleted_at ?? null
  }

  // --- not-found (bordes 1, 2, 3) ---

  test('un id no entero o no positivo se niega sin tocar la base', async ({ assert }) => {
    for (const bad of [0, -1, Number.NaN, 1.5]) {
      const decision = await resolvePersonRelease(bad)
      assert.isFalse(decision.releasable)
      if (!decision.releasable) assert.equal(decision.reason, 'not-found', String(bad))
    }
  })

  test('una persona inexistente cae en not-found', async ({ assert }) => {
    const decision = await resolvePersonRelease(2_147_483_000)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'not-found')
  })

  test('una persona ya liberada cae en not-found (idempotencia del doble disparo)', async ({
    assert,
  }) => {
    const person = await createPerson('released')
    await person.delete()
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'not-found')
  })

  test('un id que llega como texto se normaliza y resuelve igual', async ({ assert }) => {
    const person = await createPerson('string-id')
    const decision = await resolvePersonRelease(String(person.personId) as unknown as number)
    assert.isTrue(decision.releasable)
  })

  // --- linked (regla 1, CA-2, CA-3) ---

  test('empleado vivo → linked', async ({ assert }) => {
    const person = await createPerson('emp-live')
    await createEmployeeFor(person.personId, 'emp-live')
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-empleado (employee_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('emp-gone')
    await createEmployeeFor(person.personId, 'emp-gone', { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('usuario vivo → linked', async ({ assert }) => {
    const person = await createPerson('user-live')
    await createUserFor(person.personId, 'user-live')
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-usuario (user_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('user-gone')
    await createUserFor(person.personId, 'user-gone', { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('cliente vivo → linked', async ({ assert }) => {
    const person = await createPerson('cust-live')
    await createCustomerFor(person.personId)
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  test('ex-cliente (customer_deleted_at no nulo) → linked', async ({ assert }) => {
    const person = await createPerson('cust-gone')
    await createCustomerFor(person.personId, { softDeleted: true })
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'linked')
  })

  // --- stale (regla 2, CA-4, CA-5) ---

  test('sin vínculo pero creada hace días → stale', async ({ assert }) => {
    const person = await createPerson('stale')
    await setPersonCreatedAt(person.personId, DateTime.now().minus({ days: 2 }))
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'stale')
  })

  test('sin vínculo pero con fecha en el futuro → stale', async ({ assert }) => {
    const person = await createPerson('future')
    await setPersonCreatedAt(person.personId, DateTime.now().plus({ days: 2 }))
    const decision = await resolvePersonRelease(person.personId)
    assert.isFalse(decision.releasable)
    if (!decision.releasable) assert.equal(decision.reason, 'stale')
  })

  // --- releasable (regla 5, CA-1) ---

  test('sin vínculo alguno y recién creada → releasable, con la fila para borrar', async ({
    assert,
  }) => {
    const person = await createPerson('fresh')
    const decision = await resolvePersonRelease(person.personId)
    assert.isTrue(decision.releasable)
    if (decision.releasable) {
      assert.equal(decision.person.personId, person.personId)
      // El predicado decide, no borra: la persona sigue intacta.
      assert.isNull(await personDeletedAt(person.personId))
    }
  })
})
