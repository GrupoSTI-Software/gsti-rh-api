import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import { ensureRole } from '#tests/helpers/ensure_role'
import { LogStore } from '#models/MongoDB/log_store'
import type { PersonReleaseContext } from '#helpers/person_release_guard'
import { DateTime } from 'luxon'

/**
 * USRH1785436961832 — alta de empleado todo-o-nada y reintentable.
 *
 * Verifica a nivel servicio, contra la BD real de desarrollo (mismo criterio
 * que `employee_service_system_business_removal.spec.ts`):
 *  1. Un fallo en el paso de empleado revierte todo y libera a la persona del
 *     acto (criterios 1 y 2: el reintento no choca con el correo).
 *  2. `releasePersonIfOrphan` nunca toca personas ligadas a otra cosa
 *     (regla 2: el sistema queda como antes del intento).
 *  3. El alta válida conserva su comportamiento (criterio 3): empleado con
 *     slug persistido y persona intacta.
 *
 * Los datos de catálogo (departamento, posición, tipo, unidades) se toman de
 * un empleado real existente para no depender de seeds específicos.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100000)}`

/** Contexto de traza fijo: el actor no decide nada (borde 9 del Anexo B). */
const RELEASE_CONTEXT: PersonReleaseContext = { actorUserId: 7, businessUnitScope: [1] }

type CapturedLog = { collection: string; payload: Record<string, unknown> }

/**
 * Captura lo que iría a Mongo sin tocar Mongo. Mismo molde que
 * scope_denied_log_service.spec: se reemplaza `LogStore.set` y se restaura
 * en el cleanup del caso.
 */
function captureScopeDeniedLog(cleanup: (fn: () => void) => void): CapturedLog[] {
  const original = LogStore.set
  const captured: CapturedLog[] = []
  LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
    captured.push({ collection: collectionName, payload: logData })
  }
  cleanup(() => {
    LogStore.set = original
  })
  return captured
}

async function personDeletedAt(personId: number): Promise<unknown> {
  const row = await db
    .from('people')
    .where('person_id', personId)
    .select('person_deleted_at')
    .first()
  return row?.person_deleted_at ?? null
}

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

async function createTestPerson(suffix: string): Promise<Person> {
  const person = new Person()
  person.personFirstname = 'AltaTrx'
  person.personLastname = 'Test'
  person.personSecondLastname = suffix
  person.personEmail = `alta-trx-${suffix}-${STAMP}@gsti-tests.local`
  await person.save()
  return person
}

async function getTemplateEmployee(): Promise<Employee> {
  const template = await Employee.query().whereNull('employee_deleted_at').first()
  if (!template) {
    throw new Error('La BD de pruebas no tiene empleados para usar de plantilla')
  }
  return template
}

function buildEmployeePayload(template: Employee, person: Person, suffix: string): Employee {
  return {
    employeeId: 0,
    employeeFirstName: 'AltaTrx',
    employeeLastName: 'Test',
    employeeSecondLastName: suffix,
    employeeCode: `ALTATRX-${suffix}-${STAMP}`,
    employeePayrollNum: `PN-${suffix}-${STAMP}`,
    employeeHireDate: '2024-01-15 00:00:00',
    companyId: template.companyId,
    departmentId: template.departmentId,
    positionId: template.positionId,
    personId: person.personId,
    businessUnitId: template.businessUnitId,
    dailySalary: 0,
    payrollBusinessUnitId: template.payrollBusinessUnitId,
    employeeWorkSchedule: 'Onsite',
    employeeTypeId: template.employeeTypeId,
    employeeAssistDiscriminator: 0,
    employeeIgnoreConsecutiveAbsences: 0,
    employeeAuthorizeAnyZones: 0,
  } as unknown as Employee
}

async function hardDeletePerson(personId: number) {
  await db.from('people').where('person_id', personId).delete()
}

test.group('EmployeeService.create — alta todo-o-nada (USRH1785436961832)', () => {
  test('un fallo en el paso de empleado revierte todo y libera a la persona del acto', async ({
    assert,
    cleanup,
  }) => {
    const person = await createTestPerson('rollback')
    cleanup(() => hardDeletePerson(person.personId))

    const template = await getTemplateEmployee()
    const payload = buildEmployeePayload(template, person, 'rollback')
    // Tipo de empleado inexistente: reproduce el reporte de Soto (tenant sin
    // catálogo) — la FK truena al guardar el empleado.
    Object.assign(payload, { employeeTypeId: 99999999 })

    const service = getService()
    await assert.rejects(() => service.create(payload, [], RELEASE_CONTEXT))

    // Criterio 1: no queda empleado a medias del intento.
    const employeeRows = await db
      .from('employees')
      .where('person_id', person.personId)
      .count('* as total')
    assert.equal(Number(employeeRows[0].total), 0)

    // Criterio 2: la persona del acto quedó liberada (soft-delete), por lo que
    // el validador de unicidad de correo (que ignora eliminadas) ya no choca.
    const personRow = await db
      .from('people')
      .where('person_id', person.personId)
      .select('person_deleted_at')
      .first()
    assert.isNotNull(personRow.person_deleted_at)
  })

  test('releasePersonIfOrphan no toca personas ligadas a un usuario', async ({
    assert,
    cleanup,
  }) => {
    const person = await createTestPerson('linked')
    const user = new User()
    user.userEmail = `alta-trx-linked-user-${STAMP}@gsti-tests.local`
    user.userPassword = 'AltaTrxTest123!'
    user.userActive = 1
    // Cualquier rol vale: el caso solo necesita un usuario ligado a la persona.
    const role = await ensureRole('root')
    user.roleId = role.roleId
    user.personId = person.personId
    user.userEmailType = 'institutional'
    await user.save()
    cleanup(async () => {
      await db.from('users').where('user_id', user.userId).delete()
      await hardDeletePerson(person.personId)
    })

    const service = getService()
    const released = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    const personRow = await db
      .from('people')
      .where('person_id', person.personId)
      .select('person_deleted_at')
      .first()
    assert.isNull(personRow.person_deleted_at)
  })

  test('el alta válida se conserva: empleado creado con slug, responsable y persona intacta', async ({
    assert,
    cleanup,
  }) => {
    const person = await createTestPerson('ok')
    cleanup(() => hardDeletePerson(person.personId))

    const template = await getTemplateEmployee()
    const payload = buildEmployeePayload(template, person, 'ok')

    // Responsable real dentro de la transacción: cubre el hook beforeCreate de
    // user_responsible_employee, que no ve al empleado no commiteado y exige
    // la BU estampada desde el padre (regresión detectada en la siembra demo).
    const responsibleUser = await User.query()
      .whereNull('user_deleted_at')
      .preload('role')
      .firstOrFail()

    const service = getService()
    const created = await service.create(payload, [responsibleUser], RELEASE_CONTEXT)
    cleanup(async () => {
      await db
        .from('user_responsible_employees')
        .where('employee_id', created.employeeId)
        .delete()
      await db.from('employees').where('employee_id', created.employeeId).delete()
    })

    assert.isTrue(created.employeeId > 0)

    const responsibleRows = await db
      .from('user_responsible_employees')
      .where('employee_id', created.employeeId)
      .where('user_id', responsibleUser.userId)
      .count('* as total')
    assert.equal(Number(responsibleRows[0].total), 1)

    // El slug se persistió dentro de la misma transacción del alta.
    const employeeRow = await db
      .from('employees')
      .where('employee_id', created.employeeId)
      .select('employee_slug')
      .first()
    assert.isNotEmpty(employeeRow.employee_slug)

    const personRow = await db
      .from('people')
      .where('person_id', person.personId)
      .select('person_deleted_at')
      .first()
    assert.isNull(personRow.person_deleted_at)
  })
})

test.group('EmployeeService.releasePersonIfOrphan — blindaje (USRH1789698261608)', () => {
  test('reintento legítimo: persona recién creada y sin vínculo se libera y se registra la concesión', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('grant')
    cleanup(() => hardDeletePerson(person.personId))

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(released)
    assert.isNotNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].collection, 'log_scope_denied')
    assert.equal(captured[0].payload.domain, 'person')
    assert.equal(captured[0].payload.action, 'release-orphan-granted')
    assert.equal(captured[0].payload.requested_id, person.personId)
    assert.equal(captured[0].payload.actor_user_id, RELEASE_CONTEXT.actorUserId)
    assert.deepEqual(captured[0].payload.business_unit_scope, RELEASE_CONTEXT.businessUnitScope)
    // CA-12: ni datos personales ni el motivo desagregado.
    assert.notProperty(captured[0].payload, 'reason')
    assert.notProperty(captured[0].payload, 'person_email')
    assert.notProperty(captured[0].payload, 'person_created_at')
  })

  test('ex-empleado (employee_deleted_at no nulo): no se libera y se registra el rechazo', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-emp')
    const template = await getTemplateEmployee()
    const [employeeId] = await db.table('employees').insert({
      employee_sync_id: `EXEMP-${STAMP}`,
      employee_code: `EXEMP-${STAMP}`,
      employee_first_name: 'AltaTrx',
      employee_last_name: 'Test',
      employee_second_last_name: 'ex-emp',
      company_id: template.companyId,
      business_unit_id: template.businessUnitId,
      department_id: template.departmentId,
      position_id: template.positionId,
      person_id: person.personId,
      employee_type_id: template.employeeTypeId,
      employee_work_schedule: 'Onsite',
      employee_business_email: `exemp-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
      employee_deleted_at: new Date(),
    })
    cleanup(async () => {
      await db.from('employees').where('employee_id', Number(employeeId)).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.domain, 'person')
    assert.equal(captured[0].payload.action, 'release-orphan')
    assert.equal(captured[0].payload.requested_id, person.personId)
    assert.notProperty(captured[0].payload, 'reason')
  })

  test('ex-usuario (user_deleted_at no nulo): no se libera', async ({ assert, cleanup }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-user')
    const user = new User()
    user.userEmail = `alta-trx-ex-user-${STAMP}@gsti-tests.local`
    user.userPassword = 'AltaTrxTest123!'
    user.userActive = 1
    const role = await ensureRole('root')
    user.roleId = role.roleId
    user.personId = person.personId
    user.userEmailType = 'institutional'
    await user.save()
    await user.delete()
    cleanup(async () => {
      await db.from('users').where('user_id', user.userId).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('ex-cliente (customer_deleted_at no nulo): no se libera', async ({ assert, cleanup }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('ex-cust')
    const now = new Date()
    const [customerId] = await db.table('customers').insert({
      customer_uuid: `cust-trx-${STAMP}`,
      person_id: person.personId,
      customer_created_at: now,
      customer_deleted_at: now,
    })
    cleanup(async () => {
      await db.from('customers').where('customer_id', Number(customerId)).delete()
      await hardDeletePerson(person.personId)
    })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('sin vínculo pero fuera de ventana: no se libera y se registra el rechazo', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('stale')
    cleanup(() => hardDeletePerson(person.personId))
    await db
      .from('people')
      .where('person_id', person.personId)
      .update({
        person_created_at: DateTime.now().minus({ days: 2 }).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),
      })

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isFalse(released)
    assert.isNull(await personDeletedAt(person.personId))
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan')
  })

  test('idempotencia: el segundo disparo sobre la persona ya liberada no borra ni registra', async ({
    assert,
    cleanup,
  }) => {
    const captured = captureScopeDeniedLog(cleanup)
    const person = await createTestPerson('twice')
    cleanup(() => hardDeletePerson(person.personId))
    const service = getService()

    const first = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)
    const second = await service.releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(first)
    assert.isFalse(second)
    // CA-7: una sola concesión y ningún registro del not-found.
    assert.lengthOf(captured, 1)
    assert.equal(captured[0].payload.action, 'release-orphan-granted')
  })

  test('el registro es best-effort: si Mongo falla la decisión ocurre igual (CA-11)', async ({
    assert,
    cleanup,
  }) => {
    const original = LogStore.set
    LogStore.set = async () => {
      throw new Error('Mongo no disponible')
    }
    cleanup(() => {
      LogStore.set = original
    })
    const person = await createTestPerson('mongo-down')
    cleanup(() => hardDeletePerson(person.personId))

    const released = await getService().releasePersonIfOrphan(person.personId, RELEASE_CONTEXT)

    assert.isTrue(released)
    assert.isNotNull(await personDeletedAt(person.personId))
  })
})
