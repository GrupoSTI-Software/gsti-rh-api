/**
 * Tests funcionales de borrado de estructura organizacional (USRH1788466831356).
 *
 * Verifica que eliminar un departamento o puesto deje a los empleados de la
 * empresa sin asignar (department_id / position_id = NULL) y devuelva
 * data.affectedEmployees correcto. Los empleados de otra empresa o eliminados
 * no se tocan.
 *
 * Fixtures: empresas A y B propias del spec; cada caso limpia lo que creó.
 */
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Employee from '#models/employee'
import Position from '#models/position'
import Department from '#models/department'
import RoleDepartment from '#models/role_department'
import { ORG_STRUCTURE_ERROR_CODES } from '#constants/org_structure_error_codes'
import {
  cleanupOrgChartFixtures,
  createDepartmentFixture,
  createPositionFixture,
} from '#tests/helpers/org_chart_fixtures'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface TestEmployeeOpts {
  businessUnitId: number
  departmentId: number | null
  positionId: number | null
  positionLevelConfigId?: number | null
  deleted?: boolean
}

/** Crea un empleado activo apuntando a un departamento y/o puesto vía SQL directo (como en employee_scope_fixtures). */
async function createTestEmployee(opts: TestEmployeeOpts): Promise<Employee> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const now = new Date()
  const [employeeId] = await db.table('employees').insert({
    employee_sync_id: `TST-${stamp}`.slice(0, 50),
    employee_code: `TST-${stamp}`.slice(0, 20),
    employee_first_name: 'Test',
    employee_last_name: `Emp${stamp}`.slice(0, 30),
    employee_second_last_name: '',
    company_id: opts.businessUnitId,
    business_unit_id: opts.businessUnitId,
    department_id: opts.departmentId,
    position_id: opts.positionId,
    position_level_config_id: opts.positionLevelConfigId ?? null,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `tst-${stamp}@spec.local`.slice(0, 60),
    employee_deleted_at: opts.deleted ? now : null,
    employee_created_at: now,
  })
  const rows = await db.from('employees').where('employee_id', Number(employeeId))
  if (!rows[0]) throw new Error(`Employee ${employeeId} not found`)
  return Employee.findOrFail(Number(employeeId))
}

/** Borra físicamente empleados por id para no dejar rastros entre specs. */
async function hardDeleteEmployees(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await db.from('employees').whereIn('employee_id', ids).delete()
}


// ─── Specs ───────────────────────────────────────────────────────────────────

test.group('org_structure_delete_unassign — puesto', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actorA = await createBypassActor('root', 'del-pos-a')
    actorB = await createBypassActor('root', 'del-pos-b')
  })

  group.teardown(async () => {
    await cleanupOrgChartFixtures(required(actorA, 'actorA').businessUnit.businessUnitId)
    await cleanupOrgChartFixtures(required(actorB, 'actorB').businessUnit.businessUnitId)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  /**
   * CA1 · Puesto con empleados (R1, R6, R8, R9).
   * 2 empleados vivos de A + 1 eliminado de A + 1 de B → solo los 2 vivos de A quedan
   * con position_id = NULL y positionLevelConfigId = NULL.
   */
  test('CA1 · puesto con empleados: 201, affectedEmployees = 2, empleados de A sin puesto', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const b = required(actorB, 'actorB')
    const buA = a.businessUnit.businessUnitId
    const buB = b.businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buA, 'dp-CA1')
    const pos = await createPositionFixture(buA, 'pos-CA1')

    const e1 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId })
    const e2 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId, positionLevelConfigId: null })
    const eDeleted = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId, deleted: true })
    const eB = await createTestEmployee({ businessUnitId: buB, departmentId: null, positionId: pos.positionId })

    try {
      const res = await client
        .delete(`/api/positions/${pos.positionId}`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))

      assert.equal(res.status(), 201, JSON.stringify(res.body()))
      assert.equal(res.body()?.data?.affectedEmployees, 2)

      // Empleados vivos de A → sin puesto y sin nivel
      for (const id of [e1.employeeId, e2.employeeId]) {
        const emp = await Employee.findOrFail(id)
        assert.isNull(emp.positionId, `e${id} debería tener positionId = NULL`)
        assert.isNull(emp.positionLevelConfigId, `e${id} debería tener positionLevelConfigId = NULL`)
      }

      // Empleado eliminado de A conserva positionId
      const empDel = await Employee.findOrFail(eDeleted.employeeId)
      assert.equal(empDel.positionId, pos.positionId, 'eliminado debe conservar positionId')

      // Empleado de B conserva positionId
      const empB = await Employee.findOrFail(eB.employeeId)
      assert.equal(empB.positionId, pos.positionId, 'empleado de B debe conservar positionId')

      // Puesto marcado como eliminado
      const posRow = await db
        .from('positions')
        .where('position_id', pos.positionId)
        .select('position_deleted_at')
        .first()
      assert.ok(posRow?.position_deleted_at, 'position_deleted_at debe estar seteado')

      // No quedan filas de department_position de A con ese puesto
      const dpRows = await db
        .from('department_position')
        .where('position_id', pos.positionId)
        .where('business_unit_id', buA)
        .count('* as n')
      assert.equal(Number((dpRows[0] as { n: string | number }).n), 0)
    } finally {
      await hardDeleteEmployees([e1.employeeId, e2.employeeId, eDeleted.employeeId, eB.employeeId])
    }
  })

  /** CA2 · Puesto sin empleados → 201 con affectedEmployees = 0. */
  test('CA2 · puesto sin empleados: 201, affectedEmployees = 0', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')
    const pos = await createPositionFixture(a.businessUnit.businessUnitId, 'pos-CA2')

    const res = await client
      .delete(`/api/positions/${pos.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body()?.data?.affectedEmployees, 0)

    const posRow = await db
      .from('positions')
      .where('position_id', pos.positionId)
      .select('position_deleted_at')
      .first()
    assert.ok(posRow?.position_deleted_at)
  })
})

test.group('org_structure_delete_unassign — departamento', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actorA = await createBypassActor('root', 'del-dep-a')
    actorB = await createBypassActor('root', 'del-dep-b')
  })

  group.teardown(async () => {
    await cleanupOrgChartFixtures(required(actorA, 'actorA').businessUnit.businessUnitId)
    await cleanupOrgChartFixtures(required(actorB, 'actorB').businessUnit.businessUnitId)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  /**
   * CA3 · Departamento sin empleados (R2, R5, R8, R9, R11).
   * Verifica que el departamento se elimina, se retiran relaciones y permisos,
   * y el subdepartamento sigue vivo con parent_department_id intacto.
   */
  test('CA3 · depto sin empleados: 201, affectedEmployees = 0, relaciones retiradas', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buA = a.businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buA, 'dep-CA3')
    const pos = await createPositionFixture(buA, 'pos-CA3')

    // Liga departamento-puesto
    await db.table('department_position').insert({
      department_id: dept.departmentId,
      position_id: pos.positionId,
      business_unit_id: buA,
      department_position_created_at: new Date(),
      department_position_updated_at: new Date(),
    })

    // Permiso de rol sobre el departamento
    const roleDept = await RoleDepartment.create({
      roleId: a.role.roleId,
      departmentId: dept.departmentId,
    })

    // Subdepartamento
    const subDept = await createDepartmentFixture(buA, 'sub-CA3')
    await db
      .from('departments')
      .where('department_id', subDept.departmentId)
      .update({ parent_department_id: dept.departmentId })

    try {
      const res = await client
        .delete(`/api/departments/${dept.departmentId}`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))

      assert.equal(res.status(), 201, JSON.stringify(res.body()))
      assert.equal(res.body()?.data?.affectedEmployees, 0)

      // Departamento marcado como eliminado
      const deptRow = await db
        .from('departments')
        .where('department_id', dept.departmentId)
        .select('department_deleted_at')
        .first()
      assert.ok(deptRow?.department_deleted_at)

      // Sin filas de department_position de A con ese depto
      const dpRows = await db
        .from('department_position')
        .where('department_id', dept.departmentId)
        .where('business_unit_id', buA)
        .count('* as n')
      assert.equal(Number((dpRows[0] as { n: string | number }).n), 0)

      // Sin filas de role_departments con ese depto
      const rdRows = await db
        .from('role_departments')
        .where('department_id', dept.departmentId)
        .count('* as n')
      assert.equal(Number((rdRows[0] as { n: string | number }).n), 0)

      // Subdepartamento sigue vivo con parent_department_id
      const sub = await Department.find(subDept.departmentId)
      assert.ok(sub, 'subdepartamento debe seguir vivo')
      assert.equal(sub!.parentDepartmentId, dept.departmentId)
    } finally {
      await RoleDepartment.query().where('role_department_id', roleDept.roleDepartmentId).delete()
    }
  })

  /**
   * CA4 · Departamento con empleados, normal (R3, R6).
   * Primer DELETE → 409 HAS_EMPLOYEES con conteo correcto; nada cambia.
   */
  test('CA4 · depto con empleados: 409 HAS_EMPLOYEES, nada cambia', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buA = a.businessUnit.businessUnitId
    const buB = required(actorB, 'actorB').businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buA, 'dep-CA4')

    const e1 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: null })
    const e2 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: null })
    const e3 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: null })
    const eDel = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: null, deleted: true })
    const eB = await createTestEmployee({ businessUnitId: buB, departmentId: dept.departmentId, positionId: null })

    try {
      const res = await client
        .delete(`/api/departments/${dept.departmentId}`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))

      assert.equal(res.status(), 409, JSON.stringify(res.body()))
      assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES)
      assert.equal(res.body()?.data?.affectedEmployees, 3) // solo los 3 vivos de A
      assert.ok(res.body()?.detail?.length > 0)

      // Nada cambió: departamento vivo
      const deptDb = await Department.find(dept.departmentId)
      assert.ok(deptDb, 'departamento debe seguir vivo')
      assert.isNull(deptDb!.deletedAt)

      // Todos conservan department_id
      for (const id of [e1.employeeId, e2.employeeId, e3.employeeId, eDel.employeeId, eB.employeeId]) {
        const rows = await db.from('employees').where('employee_id', id).select('department_id')
        assert.equal(
          rows[0]?.department_id,
          dept.departmentId,
          `emp ${id} debe conservar department_id`
        )
      }
    } finally {
      await hardDeleteEmployees([e1.employeeId, e2.employeeId, e3.employeeId, eDel.employeeId, eB.employeeId])
    }
  })

  /**
   * CA5 · Eliminación definitiva con y sin empleados (R4, R5, R6, R8, R9, R10).
   */
  test('CA5 · force-delete con empleados: 201, affectedEmployees = 3, department_id = NULL', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buA = a.businessUnit.businessUnitId
    const buB = required(actorB, 'actorB').businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buA, 'dep-CA5')
    const pos = await createPositionFixture(buA, 'pos-CA5')

    // Liga departamento-puesto
    await db.table('department_position').insert({
      department_id: dept.departmentId,
      position_id: pos.positionId,
      business_unit_id: buA,
      department_position_created_at: new Date(),
      department_position_updated_at: new Date(),
    })

    const e1 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId })
    const e2 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId })
    const e3 = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: pos.positionId })
    const eDel = await createTestEmployee({ businessUnitId: buA, departmentId: dept.departmentId, positionId: null, deleted: true })
    const eB = await createTestEmployee({ businessUnitId: buB, departmentId: dept.departmentId, positionId: null })

    // Permiso de rol
    const roleDept = await RoleDepartment.create({
      roleId: a.role.roleId,
      departmentId: dept.departmentId,
    })

    try {
      const res = await client
        .delete(`/api/departments/${dept.departmentId}/force-delete`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))

      assert.equal(res.status(), 201, JSON.stringify(res.body()))
      assert.equal(res.body()?.data?.affectedEmployees, 3)

      // Empleados vivos de A → department_id = NULL, conservan positionId
      for (const id of [e1.employeeId, e2.employeeId, e3.employeeId]) {
        const emp = await Employee.findOrFail(id)
        assert.isNull(emp.departmentId, `emp ${id} debe tener department_id = NULL`)
        assert.equal(emp.positionId, pos.positionId, `emp ${id} debe conservar positionId`)
      }

      // Eliminado y de B conservan department_id original
      const rowDel = await db.from('employees').where('employee_id', eDel.employeeId).select('department_id').first()
      assert.equal(rowDel?.department_id, dept.departmentId, 'eliminado debe conservar department_id')

      const empB = await Employee.findOrFail(eB.employeeId)
      assert.equal(empB.departmentId, dept.departmentId, 'empleado de B debe conservar department_id')

      // Ningún empleado apunta al 999
      const none999 = [e1.employeeId, e2.employeeId, e3.employeeId]
      for (const id of none999) {
        const emp = await Employee.findOrFail(id)
        assert.notEqual(emp.departmentId, 999, `emp ${id} no debe apuntar al relleno 999`)
      }

      // Relaciones retiradas
      const dpRows = await db
        .from('department_position')
        .where('department_id', dept.departmentId)
        .where('business_unit_id', buA)
        .count('* as n')
      assert.equal(Number((dpRows[0] as { n: string | number }).n), 0)

      const rdRows = await db
        .from('role_departments')
        .where('department_id', dept.departmentId)
        .count('* as n')
      assert.equal(Number((rdRows[0] as { n: string | number }).n), 0)

      // Departamento marcado como eliminado
      const deptRow = await db
        .from('departments')
        .where('department_id', dept.departmentId)
        .select('department_deleted_at')
        .first()
      assert.ok(deptRow?.department_deleted_at)
    } finally {
      await RoleDepartment.query().where('role_department_id', roleDept.roleDepartmentId).delete()
      await hardDeleteEmployees([e1.employeeId, e2.employeeId, e3.employeeId, eDel.employeeId, eB.employeeId])
    }
  })

  test('CA5b · force-delete sin empleados: 201, affectedEmployees = 0', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const dept = await createDepartmentFixture(a.businessUnit.businessUnitId, 'dep-CA5b')

    const res = await client
      .delete(`/api/departments/${dept.departmentId}/force-delete`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 201, JSON.stringify(res.body()))
    assert.equal(res.body()?.data?.affectedEmployees, 0)
  })
})

test.group('org_structure_delete_unassign — errores', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null

  group.setup(async () => {
    actorA = await createBypassActor('root', 'del-err-a')
    actorB = await createBypassActor('root', 'del-err-b')
  })

  group.teardown(async () => {
    await cleanupOrgChartFixtures(required(actorA, 'actorA').businessUnit.businessUnitId)
    await cleanupOrgChartFixtures(required(actorB, 'actorB').businessUnit.businessUnitId)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  /**
   * CA6 · Otra empresa o inexistente → 404 NOT_FOUND con cuerpo exacto.
   */
  test('CA6a · puesto de otra empresa → 404 POSITION_NOT_FOUND', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')
    const b = required(actorB, 'actorB')
    const posB = await createPositionFixture(b.businessUnit.businessUnitId, 'pos-CA6a-b')

    // Header de A, puesto de B → mismo resultado que "no existe"
    const res = await client
      .delete(`/api/positions/${posB.positionId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 404)
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND)
    // Nada cambió en B
    const posStill = await Position.find(posB.positionId)
    assert.ok(posStill && !posStill.deletedAt, 'puesto de B debe seguir vivo')
  })

  test('CA6b · puesto inexistente → 404 POSITION_NOT_FOUND', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')

    const res = await client
      .delete('/api/positions/99999999')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 404)
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND)
  })

  test('CA6c · depto de otra empresa (normal) → 404 DEPARTMENT_NOT_FOUND', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')
    const b = required(actorB, 'actorB')
    const deptB = await createDepartmentFixture(b.businessUnit.businessUnitId, 'dep-CA6c-b')

    const res = await client
      .delete(`/api/departments/${deptB.departmentId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 404)
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND)
  })

  test('CA6d · depto de otra empresa (force-delete) → 404 DEPARTMENT_NOT_FOUND', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')
    const b = required(actorB, 'actorB')
    const deptB = await createDepartmentFixture(b.businessUnit.businessUnitId, 'dep-CA6d-b')

    const res = await client
      .delete(`/api/departments/${deptB.departmentId}/force-delete`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(res.status(), 404)
    assert.equal(res.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND)
  })

  /**
   * CA7 · Departamento ya eliminado → 404.
   */
  test('CA7 · depto ya eliminado → 404 DEPARTMENT_NOT_FOUND', async ({ client, assert }) => {
    const a = required(actorA, 'actorA')
    const dept = await createDepartmentFixture(a.businessUnit.businessUnitId, 'dep-CA7')

    // Primer delete
    const first = await client
      .delete(`/api/departments/${dept.departmentId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
    assert.equal(first.status(), 201)

    // Segundo delete → 404
    const second = await client
      .delete(`/api/departments/${dept.departmentId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))

    assert.equal(second.status(), 404)
    assert.equal(second.body()?.code, ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND)
  })

  /**
   * CA10 · Permisos de rol retirados tras eliminar (R5, S06-7).
   */
  test('CA10 · permisos de rol retirados al eliminar depto sin empleados', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buA = a.businessUnit.businessUnitId

    const dept = await createDepartmentFixture(buA, 'dep-CA10')

    // Añadir permiso de rol restringido
    const roleDept = await RoleDepartment.create({
      roleId: a.role.roleId,
      departmentId: dept.departmentId,
    })

    try {
      const res = await client
        .delete(`/api/departments/${dept.departmentId}`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))

      assert.equal(res.status(), 201)

      // No quedan filas de role_departments con ese depto
      const rows = await db
        .from('role_departments')
        .where('department_id', dept.departmentId)
        .count('* as n')
      assert.equal(Number((rows[0] as { n: string | number }).n), 0)
    } finally {
      // Por si el test falla antes del delete
      await RoleDepartment.query()
        .where('role_department_id', roleDept.roleDepartmentId)
        .delete()
        .catch(() => {})
    }
  })

  /**
   * CA11 · Editar tras eliminar: asignar departamento vivo a empleado sin depto.
   */
  test('CA11 · empleado sin depto puede recibir un departamento vivo por PUT /employees/:id', async ({
    client,
    assert,
  }) => {
    const a = required(actorA, 'actorA')
    const buA = a.businessUnit.businessUnitId

    const deptOrig = await createDepartmentFixture(buA, 'dep-CA11-orig')
    const deptNew = await createDepartmentFixture(buA, 'dep-CA11-new')

    const emp = await createTestEmployee({ businessUnitId: buA, departmentId: deptOrig.departmentId, positionId: null })

    try {
      // Eliminar el departamento original (que tiene este empleado)
      const delRes = await client
        .delete(`/api/departments/${deptOrig.departmentId}/force-delete`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))
      assert.equal(delRes.status(), 201)

      // Verificar que el empleado quedó sin depto
      const empAfterDel = await Employee.findOrFail(emp.employeeId)
      assert.isNull(empAfterDel.departmentId)

      // Reasignar departamento nuevo por PUT (CA11 de USRH1788466831270)
      const putRes = await client
        .put(`/api/employees/${emp.employeeId}`)
        .loginAs(a.user)
        .headers(businessUnitHeaders(a))
        .json({
          employeeId: emp.employeeId,
          departmentId: deptNew.departmentId,
          positionId: null,
          businessUnitId: buA,
          employeeCode: emp.employeeCode,
          employeeFirstName: emp.employeeFirstName,
          employeeLastName: emp.employeeLastName,
          employeeSecondLastName: emp.employeeSecondLastName,
          employeeHireDate: emp.employeeHireDate,
          dailySalary: emp.dailySalary,
          employeeAssistDiscriminator: emp.employeeAssistDiscriminator,
          employeeIgnoreConsecutiveAbsences: emp.employeeIgnoreConsecutiveAbsences,
          employeeAuthorizeAnyZones: emp.employeeAuthorizeAnyZones,
        })

      // El PUT devuelve 201 o 200
      assert.ok([200, 201].includes(putRes.status()), `PUT retornó ${putRes.status()}`)

      const empAfterPut = await Employee.findOrFail(emp.employeeId)
      assert.equal(empAfterPut.departmentId, deptNew.departmentId)
    } finally {
      await hardDeleteEmployees([emp.employeeId])
    }
  })
})
