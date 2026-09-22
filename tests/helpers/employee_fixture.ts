import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
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

/** Prefijo con el que `tenant_actor` nombra las unidades que crea y borra. */
const SPEC_BUSINESS_UNIT_SLUG_PREFIX = 'gate-'

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
    // La inserción por tabla se salta los hooks del modelo, y `employee_slug`
    // es NOT NULL UNIQUE sin default: lo genera `Employee.assignSlug`.
    employee_slug: randomUUID(),
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
 *
 * @throws Error si la unidad no la creó `tenant_actor` (slug `gate-*`): el
 *   borrado del organigrama es por unidad completa y en una empresa ajena
 *   (p. ej. la prestada por `createBypassUserInBusinessUnit`) se llevaría datos
 *   que el spec no creó.
 */
export async function cleanupEmployeeFixture(fixture: EmployeeFixture | null): Promise<void> {
  if (!fixture) return

  const businessUnit = await BusinessUnit.find(fixture.businessUnitId)
  if (businessUnit && !businessUnit.businessUnitSlug.startsWith(SPEC_BUSINESS_UNIT_SLUG_PREFIX)) {
    throw new Error(
      `[tests/helpers/employee_fixture] La unidad "${businessUnit.businessUnitSlug}" no es de un spec: no se borra su organigrama.`
    )
  }

  await db.from('employees').where('employee_id', fixture.employee.employeeId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  await cleanupOrgChartFixtures(fixture.businessUnitId)
}
