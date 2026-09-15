import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import Person from '#models/person'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'

/**
 * Colaborador de prueba dentro de la unidad de negocio de un actor de
 * `tenant_actor`.
 *
 * Por qué existe: los specs de checadas y de condición médica necesitan un
 * empleado de la empresa del actor. Los de desarrollo no existen en una BD
 * recién sembrada y los specs que los buscaban ("el primer empleado con
 * usuario en pivote") fallaban en el setup.
 *
 * El empleado se inserta por tabla y no por modelo para no disparar los hooks
 * de alta (sincronización, bitácora, cuota), que no son asunto de estos specs.
 * Departamento y puesto salen de `org_chart_fixtures`.
 */

export interface EmployeeFixture {
  employee: Employee
  person: Person
  businessUnitId: number
}

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

export async function createEmployeeFixture(
  businessUnitId: number,
  prefix: string
): Promise<EmployeeFixture> {
  const stamp = uniqueStamp()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'Fixture',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
  })
  const department = await createDepartmentFixture(businessUnitId, `Departamento ${prefix}`)
  const position = await createPositionFixture(businessUnitId, `Puesto ${prefix}`)
  const code = `EMP-${stamp}`.slice(0, 40)
  const [employeeId] = await db.table('employees').insert({
    employee_sync_id: code,
    employee_code: code,
    employee_first_name: 'Empleado',
    employee_last_name: 'Fixture',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: department.departmentId,
    position_id: position.positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: new Date(),
  })

  return {
    employee: await Employee.query().withTrashed().where('employee_id', Number(employeeId)).firstOrFail(),
    person,
    businessUnitId,
  }
}

/**
 * Borra el empleado, su persona y el organigrama de la unidad. Lo que el caso
 * haya colgado del empleado (checadas, condiciones médicas) lo limpia el spec
 * antes de llamar aquí.
 */
export async function cleanupEmployeeFixture(fixture: EmployeeFixture | null): Promise<void> {
  if (!fixture) return

  await db.from('employees').where('employee_id', fixture.employee.employeeId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  await cleanupOrgChartFixtures(fixture.businessUnitId)
}
