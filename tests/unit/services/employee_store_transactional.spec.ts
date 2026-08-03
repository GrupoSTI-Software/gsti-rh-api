import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import EmployeeService from '#services/employee_service'

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
    throw new Error('La BD de desarrollo no tiene empleados para usar de plantilla')
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
    await assert.rejects(() => service.create(payload, []))

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
    user.roleId = 2
    user.personId = person.personId
    user.userEmailType = 'institutional'
    await user.save()
    cleanup(async () => {
      await db.from('users').where('user_id', user.userId).delete()
      await hardDeletePerson(person.personId)
    })

    const service = getService()
    const released = await service.releasePersonIfOrphan(person.personId)

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
    const created = await service.create(payload, [responsibleUser])
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
