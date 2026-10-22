import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'
import Department from '#models/department'
import Person from '#models/person'
import Position from '#models/position'
import EmployeeContractType from '#models/employee_contract_type'
import OrgChartMoveService from '#services/org_chart_move_service'
import { TenantContext } from '#utils/tenant_context'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
  linkDepartmentPositionFixture,
} from '#tests/helpers/org_chart_fixtures'

/**
 * VLRH-H1792361821461 — el empleado toma el par del contrato más reciente solo
 * si ese par es coherente. El contrato descuadrado se guarda y no se copia.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const RECENT_START = '2024-01-01'

interface EmployeeRecord {
  employeeId: number
  personId: number
}

let folioSequence = 0
function folio(label: string): string {
  folioSequence += 1
  return `QA-CPD-${STAMP}-${folioSequence}-${label}`.slice(0, 100)
}

test.group('Copia puesto-departamento desde el contrato (VLRH-H1792361821461)', (group) => {
  let actor: TenantActor
  let contractType: EmployeeContractType
  let produccion: Department
  let ventas: Department
  let supervisor: Position
  let ejecutivo: Position
  let previousEnforcement = false
  const employees: EmployeeRecord[] = []

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement('employees', true)
    actor = await createTenantActor('contrato-puesto-depto')
    await grantModulePermissions(actor, 'employees', ['tab-trabajo-write', 'tab-trabajo-delete'])

    const unit = actor.businessUnit.businessUnitId
    produccion = await createDepartmentFixture(unit, 'Producción')
    ventas = await createDepartmentFixture(unit, 'Ventas')
    supervisor = await createPositionFixture(unit, 'Supervisor de línea')
    ejecutivo = await createPositionFixture(unit, 'Ejecutivo')
    await linkDepartmentPositionFixture(produccion.departmentId, supervisor.positionId, unit)
    await linkDepartmentPositionFixture(ventas.departmentId, ejecutivo.positionId, unit)

    contractType = await EmployeeContractType.create({
      employeeContractTypeName: uniqueTestName('Tipo QA copia').slice(0, 100),
      employeeContractTypeDescription: 'Tipo temporal de spec',
      employeeContractTypeSlug: `tipo-qa-copia-${STAMP}`,
    })
  })

  group.teardown(async () => {
    try {
      const employeeIds = employees.map((employee) => employee.employeeId)
      if (employeeIds.length > 0) {
        await db.from('employee_contracts').whereIn('employee_id', employeeIds).delete()
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
        await db
          .from('people')
          .whereIn(
            'person_id',
            employees.map((employee) => employee.personId)
          )
          .delete()
      }
      if (actor) await cleanupOrgChartFixtures(actor.businessUnit.businessUnitId)
      if (contractType) {
        await EmployeeContractType.query()
          .withTrashed()
          .where('employee_contract_type_id', contractType.employeeContractTypeId)
          .delete()
      }
      await cleanupTenantActor(actor ?? null)
    } finally {
      await setModuleEnforcement('employees', previousEnforcement)
    }
  })

  async function createEmployee(label: string): Promise<EmployeeRecord> {
    const unit = actor.businessUnit.businessUnitId
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'Contrato',
      personSecondLastname: label,
      personEmail: `contrato-puesto-depto-${label}-${STAMP}@gsti-tests.local`,
      businessUnitId: unit,
    })
    const code = `EMP-CPD-${STAMP}-${label}`.slice(0, 40)
    const [employeeId] = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: code,
      employee_code: code,
      employee_first_name: 'Empleado',
      employee_last_name: 'Contrato',
      employee_second_last_name: label,
      company_id: unit,
      business_unit_id: unit,
      payroll_business_unit_id: unit,
      department_id: produccion.departmentId,
      position_id: supervisor.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `contrato-puesto-depto-work-${label}-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
    })
    const record = { employeeId: Number(employeeId), personId: person.personId }
    employees.push(record)
    return record
  }

  function contractBody(employee: EmployeeRecord, contractFolio: string, overrides: Record<string, unknown> = {}) {
    const body: Record<string, unknown> = {
      employeeContractFolio: contractFolio,
      employeeContractStartDate: RECENT_START,
      employeeContractStatus: 'active',
      employeeContractMonthlyNetSalary: 10000,
      employeeContractTypeId: contractType.employeeContractTypeId,
      employeeId: employee.employeeId,
      payrollBusinessUnitId: actor.businessUnit.businessUnitId,
      employeeContractActive: 1,
      ...overrides,
    }
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key]
    }
    return body
  }

  async function employeeStructure(employee: EmployeeRecord) {
    return db.from('employees').where('employee_id', employee.employeeId).first()
  }

  test('CA-5: un contrato coherente copia departamento y puesto', async ({ client, assert }) => {
    const employee = await createEmployee('ca5')
    const contractFolio = folio('ca5')

    const response = await client
      .post('/api/employee-contracts')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: ventas.departmentId,
          positionId: ejecutivo.positionId,
        })
      )

    response.assertStatus(201)
    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, ventas.departmentId)
    assert.equal(structure.position_id, ejecutivo.positionId)
  })

  test('CA-6: un contrato descuadrado se guarda y no se copia', async ({ client, assert }) => {
    const employee = await createEmployee('ca6')
    const contractFolio = folio('ca6')

    const response = await client
      .post('/api/employee-contracts')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: ventas.departmentId,
          positionId: supervisor.positionId,
        })
      )

    response.assertStatus(201)
    const contract = await db.from('employee_contracts').where('employee_contract_folio', contractFolio).first()
    assert.equal(contract.department_id, ventas.departmentId)
    assert.equal(contract.position_id, supervisor.positionId)
    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, produccion.departmentId)
    assert.equal(structure.position_id, supervisor.positionId)
  })

  test('CA-7: un contrato con solo el departamento no deja el puesto en un departamento ajeno', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployee('ca7')
    const contractFolio = folio('ca7')

    const response = await client
      .post('/api/employee-contracts')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: ventas.departmentId,
          positionId: null,
        })
      )

    response.assertStatus(201)
    const contract = await db.from('employee_contracts').where('employee_contract_folio', contractFolio).first()
    assert.equal(contract.department_id, ventas.departmentId)
    assert.isNull(contract.position_id)
    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, produccion.departmentId)
    assert.equal(structure.position_id, supervisor.positionId)
  })

  test('CA-8: reguardar el contrato viejo después de mover el puesto no regresa al empleado', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployee('ca8')
    const contractFolio = folio('ca8')
    const created = await client
      .post('/api/employee-contracts')
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: produccion.departmentId,
          positionId: supervisor.positionId,
        })
      )
    created.assertStatus(201)
    const contractId = Number(created.body().data.employeeContract.employeeContractId)

    const unit = actor.businessUnit.businessUnitId
    const moved = await TenantContext.run([unit], async () => {
      return new OrgChartMoveService({ formatMessage: (key: string) => key } as unknown as I18n).relocatePosition(
        supervisor.positionId,
        null,
        ventas.departmentId
      )
    })
    if (!moved.ok) {
      throw new Error(`el movimiento falló: ${moved.payload.message}`)
    }

    const dragged = await employeeStructure(employee)
    assert.equal(dragged.department_id, ventas.departmentId)
    assert.equal(dragged.position_id, supervisor.positionId)

    const updated = await client
      .put(`/api/employee-contracts/${contractId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: produccion.departmentId,
          positionId: supervisor.positionId,
          employeeContractMonthlyNetSalary: 12345,
        })
      )

    updated.assertStatus(200)
    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, ventas.departmentId)
    assert.equal(structure.position_id, supervisor.positionId)
  })
})
