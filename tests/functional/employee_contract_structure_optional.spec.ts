import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Department from '#models/department'
import Position from '#models/position'
import Person from '#models/person'
import EmployeeContractType from '#models/employee_contract_type'
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
} from '#tests/helpers/org_chart_fixtures'

/**
 * USRH1789328927648 — el contrato del empleado se guarda sin departamento ni
 * puesto, y el empleado solo copia del contrato más reciente lo que ese
 * contrato trae, sigue vigente y es de SU empresa. Punta a punta por HTTP.
 *
 * Fixture propio: empresa A (`DA1`, `DA2`, `PA1`, `PA2`) y empresa B (`DB1`,
 * `PB1`). Cada caso da de alta su propio empleado `E` de A en `DA1`/`PA1`, así
 * que ningún caso depende del estado que dejó otro. La suite no aísla entre
 * specs: los contratos se buscan por su folio único de corrida, no por conteos.
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
const OLD_START = '2020-01-01'
const RECENT_START = '2024-01-01'

interface EmployeeRecord {
  employeeId: number
  personId: number
}

let folioSequence = 0
function folio(label: string): string {
  folioSequence += 1
  return `QA-CSO-${STAMP}-${folioSequence}-${label}`.slice(0, 100)
}

test.group('Contrato sin estructura y sin relleno — /api/employee-contracts (USRH1789328927648)', (group) => {
  let actorA: TenantActor
  let actorB: TenantActor
  let contractType: EmployeeContractType
  let da1: Department
  let da2: Department
  let pa1: Position
  let pa2: Position
  let db1: Department
  let pb1: Position
  let previousEnforcement = false
  const employees: EmployeeRecord[] = []

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement('employees', true)
    actorA = await createTenantActor('contract-structure-a')
    actorB = await createTenantActor('contract-structure-b')
    await grantModulePermissions(actorA, 'employees', ['tab-trabajo-write', 'tab-trabajo-delete'])

    const unitA = actorA.businessUnit.businessUnitId
    const unitB = actorB.businessUnit.businessUnitId
    da1 = await createDepartmentFixture(unitA, 'DA1')
    da2 = await createDepartmentFixture(unitA, 'DA2')
    pa1 = await createPositionFixture(unitA, 'PA1')
    pa2 = await createPositionFixture(unitA, 'PA2')
    db1 = await createDepartmentFixture(unitB, 'DB1')
    pb1 = await createPositionFixture(unitB, 'PB1')

    contractType = await EmployeeContractType.create({
      employeeContractTypeName: uniqueTestName('Tipo QA contrato').slice(0, 100),
      employeeContractTypeDescription: 'Tipo temporal de spec',
      employeeContractTypeSlug: `tipo-qa-contrato-${STAMP}`,
    })
  })

  group.teardown(async () => {
    try {
      const employeeIds = employees.map((employee) => employee.employeeId)
      if (employeeIds.length > 0) {
        await db.from('employee_contracts').whereIn('employee_id', employeeIds).delete()
        await db.from('employee_salary_history').whereIn('employee_id', employeeIds).delete()
        await db.from('employees').whereIn('employee_id', employeeIds).delete()
        await Person.query()
          .whereIn(
            'person_id',
            employees.map((employee) => employee.personId)
          )
          .delete()
      }
      if (actorA) await cleanupOrgChartFixtures(actorA.businessUnit.businessUnitId)
      if (actorB) await cleanupOrgChartFixtures(actorB.businessUnit.businessUnitId)
      if (contractType) {
        await EmployeeContractType.query()
          .withTrashed()
          .where('employee_contract_type_id', contractType.employeeContractTypeId)
          .delete()
      }
      await cleanupTenantActor(actorA ?? null)
      await cleanupTenantActor(actorB ?? null)
    } finally {
      await setModuleEnforcement('employees', previousEnforcement)
    }
  })

  /** Empleado `E` de la empresa A, en `DA1`/`PA1`. */
  async function createEmployeeE(label: string): Promise<EmployeeRecord> {
    const unitA = actorA.businessUnit.businessUnitId
    const person = await Person.create({
      personFirstname: 'Empleado',
      personLastname: 'ContratoSinEstructura',
      personSecondLastname: label,
      personEmail: `contrato-sin-estructura-${label}-${STAMP}@gsti-tests.local`,
      businessUnitId: unitA,
    })
    const code = `EMP-CSO-${STAMP}-${label}`.slice(0, 40)
    const [employeeId] = await db.table('employees').insert({
      employee_slug: opaqueEmployeeSlug(),
      employee_sync_id: code,
      employee_code: code,
      employee_first_name: 'Empleado',
      employee_last_name: 'ContratoSinEstructura',
      employee_second_last_name: label,
      company_id: unitA,
      business_unit_id: unitA,
      payroll_business_unit_id: unitA,
      department_id: da1.departmentId,
      position_id: pa1.positionId,
      person_id: person.personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `contrato-sin-estructura-work-${label}-${STAMP}@gsti-tests.local`,
      employee_created_at: new Date(),
    })
    const record = { employeeId: Number(employeeId), personId: person.personId }
    employees.push(record)
    return record
  }

  /** Body completo de alta/edición; `overrides` con `undefined` quita la llave. */
  function contractBody(
    employee: EmployeeRecord,
    contractFolio: string,
    overrides: Record<string, unknown> = {}
  ) {
    const body: Record<string, unknown> = {
      employeeContractFolio: contractFolio,
      employeeContractStartDate: RECENT_START,
      employeeContractStatus: 'active',
      employeeContractMonthlyNetSalary: 10000,
      employeeContractTypeId: contractType.employeeContractTypeId,
      employeeId: employee.employeeId,
      payrollBusinessUnitId: actorA.businessUnit.businessUnitId,
      employeeContractActive: 1,
      ...overrides,
    }
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key]
    }
    return body
  }

  async function contractRow(contractFolio: string) {
    return db.from('employee_contracts').where('employee_contract_folio', contractFolio).first()
  }

  async function contractIdOf(contractFolio: string): Promise<number> {
    const row = await contractRow(contractFolio)
    return Number(row.employee_contract_id)
  }

  async function employeeStructure(employee: EmployeeRecord) {
    return db
      .from('employees')
      .where('employee_id', employee.employeeId)
      .select(['department_id', 'position_id'])
      .first()
  }

  /** Contrato legado insertado directo en base (lo que un alta antigua pudo dejar). */
  async function insertLegacyContract(
    employee: EmployeeRecord,
    contractFolio: string,
    structure: { departmentId: number | null; positionId: number | null },
    startDate: string
  ): Promise<number> {
    const [contractId] = await db.table('employee_contracts').insert({
      employee_contract_folio: contractFolio,
      employee_contract_start_date: `${startDate} 00:00:00`,
      employee_contract_type_id: contractType.employeeContractTypeId,
      employee_id: employee.employeeId,
      business_unit_id: actorA.businessUnit.businessUnitId,
      department_id: structure.departmentId,
      position_id: structure.positionId,
      payroll_business_unit_id: actorA.businessUnit.businessUnitId,
      employee_contract_status: 'active',
      employee_contract_monthly_net_salary: 10000,
      employee_contract_active: 1,
      employee_contract_created_at: new Date(),
    })
    return Number(contractId)
  }

  test('CA1: alta sin departamento ni puesto guarda el contrato en NULL y el empleado no cambia', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca1')
    const contractFolio = folio('ca1')

    const response = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, contractFolio))

    response.assertStatus(201)
    assert.equal(response.body().type, 'success')
    assert.isNull(response.body().data.employeeContract.departmentId)
    assert.isNull(response.body().data.employeeContract.positionId)

    const row = await contractRow(contractFolio)
    assert.isNotNull(row)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)

    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, da1.departmentId)
    assert.equal(structure.position_id, pa1.positionId)
  })

  test('CA2: alta con DA2/PA2 la copia al empleado; editar con null deja el contrato en NULL y el empleado conserva', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca2')
    const contractFolio = folio('ca2')

    const created = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: da2.departmentId,
          positionId: pa2.positionId,
        })
      )

    created.assertStatus(201)
    assert.equal(created.body().data.employeeContract.departmentId, da2.departmentId)
    assert.equal(created.body().data.employeeContract.positionId, pa2.positionId)
    const afterCreate = await employeeStructure(employee)
    assert.equal(afterCreate.department_id, da2.departmentId)
    assert.equal(afterCreate.position_id, pa2.positionId)

    const contractId = await contractIdOf(contractFolio)

    const updated = await client
      .put(`/api/employee-contracts/${contractId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, contractFolio, { departmentId: null, positionId: null }))

    updated.assertStatus(200)
    assert.isNull(updated.body().data.employeeContract.departmentId)
    assert.isNull(updated.body().data.employeeContract.positionId)

    const row = await contractRow(contractFolio)
    assert.isNull(row.department_id)
    assert.isNull(row.position_id)

    const afterUpdate = await employeeStructure(employee)
    assert.equal(afterUpdate.department_id, da2.departmentId)
    assert.equal(afterUpdate.position_id, pa2.positionId)
  })

  test('CA3: editar sin mandar las llaves conserva el departamento y el puesto del contrato', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca3')
    const contractFolio = folio('ca3')
    const contractId = await insertLegacyContract(
      employee,
      contractFolio,
      { departmentId: da2.departmentId, positionId: pa2.positionId },
      RECENT_START
    )

    const response = await client
      .put(`/api/employee-contracts/${contractId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, contractFolio, { employeeContractMonthlyNetSalary: 12345 }))

    response.assertStatus(200)
    assert.equal(response.body().data.employeeContract.departmentId, da2.departmentId)
    assert.equal(response.body().data.employeeContract.positionId, pa2.positionId)

    const row = await contractRow(contractFolio)
    assert.equal(Number(row.employee_contract_monthly_net_salary), 12345)
    assert.equal(row.department_id, da2.departmentId)
    assert.equal(row.position_id, pa2.positionId)
  })

  test('CA4: al borrar el contrato reciente, el departamento dado de baja del antiguo no se copia', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca4')
    // El departamento del contrato antiguo se da de baja DESPUÉS de asignarlo.
    const retiredDepartment = await createDepartmentFixture(actorA.businessUnit.businessUnitId, 'DA1 baja')
    const oldFolio = folio('ca4-antiguo')
    const recentFolio = folio('ca4-reciente')
    await insertLegacyContract(
      employee,
      oldFolio,
      { departmentId: retiredDepartment.departmentId, positionId: null },
      OLD_START
    )

    const created = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(
        contractBody(employee, recentFolio, {
          departmentId: da2.departmentId,
          positionId: pa2.positionId,
        })
      )
    created.assertStatus(201)
    const before = await employeeStructure(employee)
    assert.equal(before.department_id, da2.departmentId)
    assert.equal(before.position_id, pa2.positionId)

    await retiredDepartment.delete()

    const recentId = await contractIdOf(recentFolio)
    const response = await client
      .delete(`/api/employee-contracts/${recentId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    const recent = await contractRow(recentFolio)
    assert.isNotNull(recent.employee_contract_deleted_at)

    const after = await employeeStructure(employee)
    assert.equal(after.department_id, da2.departmentId)
    assert.notEqual(after.department_id, retiredDepartment.departmentId)
    assert.equal(after.position_id, pa2.positionId)
  })

  test('CA5: un departamento de otra empresa se rechaza con 400 legado y un contrato legado de otra empresa no se copia', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca5')
    const rejectedFolio = folio('ca5-rechazado')

    const rejected = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, rejectedFolio, { departmentId: db1.departmentId }))

    rejected.assertStatus(400)
    assert.equal(rejected.body().type, 'warning')
    assert.equal(rejected.body().title, 'The department was not found')
    assert.isString(rejected.body().message)
    assert.isDefined(rejected.body().data)
    assert.isNull(await contractRow(rejectedFolio))
    const unchanged = await employeeStructure(employee)
    assert.equal(unchanged.department_id, da1.departmentId)
    assert.equal(unchanged.position_id, pa1.positionId)

    // Contrato legado de E con la estructura de B, más antiguo que el de A.
    const legacyFolio = folio('ca5-legado')
    const recentFolio = folio('ca5-reciente')
    await insertLegacyContract(
      employee,
      legacyFolio,
      { departmentId: db1.departmentId, positionId: pb1.positionId },
      OLD_START
    )
    const created = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(
        contractBody(employee, recentFolio, {
          departmentId: da2.departmentId,
          positionId: pa2.positionId,
        })
      )
    created.assertStatus(201)
    const before = await employeeStructure(employee)
    assert.equal(before.department_id, da2.departmentId)
    assert.equal(before.position_id, pa2.positionId)

    const recentId = await contractIdOf(recentFolio)
    const response = await client
      .delete(`/api/employee-contracts/${recentId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
    response.assertStatus(200)

    const after = await employeeStructure(employee)
    assert.notEqual(after.department_id, db1.departmentId)
    assert.notEqual(after.position_id, pb1.positionId)
    assert.equal(after.department_id, da2.departmentId)
    assert.equal(after.position_id, pa2.positionId)
  })

  test('CA6: al borrar el único contrato, el empleado conserva su departamento y su puesto', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca6')
    const contractFolio = folio('ca6')

    const created = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(
        contractBody(employee, contractFolio, {
          departmentId: da2.departmentId,
          positionId: pa2.positionId,
        })
      )
    created.assertStatus(201)
    const contractId = await contractIdOf(contractFolio)

    const response = await client
      .delete(`/api/employee-contracts/${contractId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))

    response.assertStatus(200)
    const live = await db
      .from('employee_contracts')
      .where('employee_id', employee.employeeId)
      .whereNull('employee_contract_deleted_at')
    assert.lengthOf(live, 0)

    const after = await employeeStructure(employee)
    assert.isNotNull(after.department_id)
    assert.isNotNull(after.position_id)
    assert.equal(after.department_id, da2.departmentId)
    assert.equal(after.position_id, pa2.positionId)
  })

  test('CA7: departmentId 0 en alta y en edición responde 422 con su código, sin SQL y sin guardar nada', async ({
    client,
    assert,
  }) => {
    const employee = await createEmployeeE('ca7')
    const postFolio = folio('ca7-alta')
    const putFolio = folio('ca7-edicion')
    const editedFolio = folio('ca7-editado')

    function assertValidationBody(body: Record<string, unknown>) {
      assert.equal(body.type, 'warning')
      assert.equal(body.title, 'Datos del contrato no válidos')
      assert.equal(body.message, 'Revisa los datos del contrato')
      assert.equal(body.key, 'datos-del-contrato-no-validos')
      assert.equal(body.code, 'EMP.CONTRACT.VAL_INPUT')
      assert.isString(body.detail)
      assert.isNotEmpty(body.detail)
      assert.isString(body.error)
      assert.equal(body.error, body.detail)
      assert.isArray(body.errors)
      assert.isAbove((body.errors as unknown[]).length, 0)
      const serialized = JSON.stringify(body)
      assert.notMatch(serialized, /sql|select |insert |update |ER_|errno|stack|at \S+ \(/i)
    }

    const posted = await client
      .post('/api/employee-contracts')
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, postFolio, { departmentId: 0 }))

    posted.assertStatus(422)
    assertValidationBody(posted.body())
    assert.isNull(await contractRow(postFolio))

    const contractId = await insertLegacyContract(
      employee,
      putFolio,
      { departmentId: da2.departmentId, positionId: pa2.positionId },
      RECENT_START
    )
    const putResponse = await client
      .put(`/api/employee-contracts/${contractId}`)
      .loginAs(actorA.user)
      .headers(businessUnitHeaders(actorA))
      .json(contractBody(employee, editedFolio, { departmentId: 0 }))

    putResponse.assertStatus(422)
    assertValidationBody(putResponse.body())
    assert.isNull(await contractRow(editedFolio))
    const row = await contractRow(putFolio)
    assert.equal(row.department_id, da2.departmentId)
    assert.equal(row.position_id, pa2.positionId)

    const structure = await employeeStructure(employee)
    assert.equal(structure.department_id, da1.departmentId)
    assert.equal(structure.position_id, pa1.positionId)
  })
})
