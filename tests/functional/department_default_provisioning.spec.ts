import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Role from '#models/role'
import RoleDepartment from '#models/role_department'
import DepartmentProvisioningService from '#services/department_provisioning_service'
import { DEFAULT_DEPARTMENT_CODE, DEFAULT_DEPARTMENT_NAME } from '#constants/department'
import { purgeTenantDepartments } from '#tests/helpers/purge_tenant_departments'
import { TenantContext } from '#utils/tenant_context'

/**
 * Departamento raíz de la empresa nueva (Dirección General) y su asignación a roles.
 *
 * Se prueba `DepartmentProvisioningService.ensureDefault` sobre empresas desnudas, con los roles de la
 * empresa y los de otra empresa, porque lo que se protege es doble: que la empresa nazca con su
 * departamento raíz marcado como default, y que la asignación a roles (`role_departments`) no cruce
 * empresas — `Role` no lleva el scope de empresa de `Department`. Las dos altas reales (self-service y
 * empresa adicional) lo ejercitan en `branch_office_default_provisioning.spec.ts`.
 */

async function createBareBusinessUnit(stamp: number, suffix: string): Promise<BusinessUnit> {
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Dept Default ${suffix} ${stamp}`
  businessUnit.businessUnitSlug = `dept-default-${suffix}-${stamp}`
  businessUnit.businessUnitLegalName = businessUnit.businessUnitName
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function createTenantRole(businessUnitId: number, slug: string): Promise<Role> {
  return Role.create({
    roleName: slug,
    roleSlug: slug,
    roleDescription: 'Fixture de siembra de departamento default',
    roleActive: 1,
    businessUnitId,
  })
}

/** Siembra dentro de una transacción y del contexto de la empresa, como lo hacen las dos altas. */
function seed(businessUnitId: number): Promise<Department> {
  return TenantContext.run([businessUnitId], () =>
    db.transaction((trx) => DepartmentProvisioningService.ensureDefault(businessUnitId, trx))
  )
}

async function assignedRoleIds(departmentId: number): Promise<number[]> {
  const rows = await RoleDepartment.query()
    .where('department_id', departmentId)
    .whereNull('role_department_deleted_at')
  return rows.map((row) => row.roleId).sort()
}

test.group('Departamento default de la empresa nueva — ensureDefault', (group) => {
  let own: BusinessUnit
  let other: BusinessUnit
  let ownRoles: Role[]
  let otherRole: Role

  group.each.setup(async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000)
    own = await createBareBusinessUnit(stamp, 'own')
    other = await createBareBusinessUnit(stamp, 'other')
    ownRoles = [
      await createTenantRole(own.businessUnitId, `dd-admin-${stamp}`),
      await createTenantRole(own.businessUnitId, `dd-empleado-${stamp}`),
    ]
    otherRole = await createTenantRole(other.businessUnitId, `dd-ajeno-${stamp}`)
  })

  group.each.teardown(async () => {
    for (const businessUnit of [own, other]) {
      await purgeTenantDepartments(businessUnit.businessUnitId)
      await Role.query().withTrashed().where('business_unit_id', businessUnit.businessUnitId).delete()
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
  })

  test('siembra "Dirección General" como departamento raíz, activo y marcado como default', async ({
    assert,
  }) => {
    const department = await seed(own.businessUnitId)

    assert.equal(department.departmentName, DEFAULT_DEPARTMENT_NAME)
    assert.equal(department.departmentCode, DEFAULT_DEPARTMENT_CODE)
    assert.isTrue(Boolean(department.departmentIsDefault))
    assert.equal(department.departmentActive, 1)
    assert.isNull(department.parentDepartmentId)
    assert.equal(department.businessUnitId, own.businessUnitId)
  })

  test('lo asigna a los roles de su empresa y a ninguno de otra empresa (los globales se conservan)', async ({ assert }) => {
    const department = await seed(own.businessUnitId)

    const assigned = await assignedRoleIds(department.departmentId)
    for (const role of ownRoles) assert.include(assigned, role.roleId)
    assert.notInclude(assigned, otherRole.roleId)
  })

  test('es idempotente: la segunda invocación devuelve el mismo departamento sin duplicar', async ({
    assert,
  }) => {
    const first = await seed(own.businessUnitId)
    const second = await seed(own.businessUnitId)

    assert.equal(second.departmentId, first.departmentId)
    const departments = await db
      .from('departments')
      .where('business_unit_id', own.businessUnitId)
      .whereNull('department_deleted_at')
    assert.lengthOf(departments, 1)
  })

  test('si la transacción del alta se revierte, no queda departamento ni asignación', async ({
    assert,
  }) => {
    await TenantContext.run([own.businessUnitId], async () => {
      try {
        await db.transaction(async (trx) => {
          await DepartmentProvisioningService.ensureDefault(own.businessUnitId, trx)
          throw new Error('fallo forzado del alta')
        })
      } catch {
        // El rollback es lo que se prueba.
      }
    })

    const departments = await db.from('departments').where('business_unit_id', own.businessUnitId)
    assert.lengthOf(departments, 0)
  })
})
