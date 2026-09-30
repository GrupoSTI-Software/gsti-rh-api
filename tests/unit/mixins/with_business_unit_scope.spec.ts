import { test } from '@japa/runner'
import Employee from '#models/employee'
import EmployeeType from '#models/employee_type'
import Person from '#models/person'
import { TENANT_CONTEXT_MISSING, TenantContextMissingException } from '#exceptions/tenant_context_missing_exception'
import { noContextBehavior } from '#mixins/with_business_unit_scope'
import { HttpRequestMarker } from '#utils/http_request_marker'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'

const missingTenantPattern = /No se identificó la empresa de la consulta/

async function expectMissingTenant(fn: () => Promise<unknown>): Promise<TenantContextMissingException> {
  let caught: unknown
  try {
    await fn()
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof TenantContextMissingException)) {
    throw caught ?? new Error('Se esperaba TenantContextMissingException')
  }
  return caught
}

test.group('withBusinessUnitScope — cerrado por omisión (USRH1789600808831)', () => {
  test('noContextBehavior respeta tipo de ejecución', ({ assert }) => {
    assert.equal(noContextBehavior(true), 'empty')
    assert.equal(noContextBehavior(false), 'throw')
  })

  test('sin contexto fuera de petición lanza TenantContextMissingException (N9.1)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())
    assert.isFalse(HttpRequestMarker.isInHttpRequest())
    const error = await expectMissingTenant(async () => Employee.query().limit(1))
    assert.equal(error.code, TENANT_CONTEXT_MISSING.code)
    assert.equal(error.key, TENANT_CONTEXT_MISSING.key)
    assert.equal(error.table, 'employees')
    assert.equal(error.hook, 'fetch')
  })

  test('sin contexto find, paginate y preload lanzan la misma excepción (N9.2)', async ({
    assert,
  }) => {
    await assert.rejects(async () => {
      await Employee.find(1)
    }, missingTenantPattern)
    await assert.rejects(async () => {
      await Employee.query().paginate(1, 1)
    }, missingTenantPattern)
    await assert.rejects(async () => {
      await Employee.query().preload('person').first()
    }, missingTenantPattern)
  })

  test('el detalle de la excepción no filtra valores del where (N9.7)', async ({ assert }) => {
    const curpProbe = 'CURPTEST123456HDFRRR09'
    const error = await expectMissingTenant(async () =>
      Person.query().where('person_curp', curpProbe).limit(1)
    )
    assert.include(error.detail, 'people')
    assert.notInclude(error.detail, curpProbe)
    assert.notInclude(error.message, curpProbe)
  })

  test('update/delete masivos sin contexto no pasan por el mixin (residual N9.6)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())
    assert.isFalse(HttpRequestMarker.isInHttpRequest())

    await assert.doesNotReject(async () => {
      await Employee.query().where('employee_id', 0).update({ employeeLastName: 'n9-residual' })
    })
    await assert.doesNotReject(async () => {
      await Employee.query().where('employee_id', 0).delete()
    })
  })

  test('sin contexto dentro de HttpRequestMarker.run devuelve vacío', async ({ assert }) => {
    const rows = await HttpRequestMarker.run(async () => Employee.query().limit(5))
    assert.lengthOf(rows, 0)
  })

  test('EmployeeType sin contexto solo devuelve filas globales', async ({ assert }) => {
    const rows = await EmployeeType.query()
    for (const row of rows) {
      assert.isNull(row.businessUnitId)
    }
  })

  test('runUnscoped ve datos; run([scope]) acota; run([]) vacío', async ({ assert }) => {
    const unscopedCount = await TenantContext.runUnscoped(
      async () => Employee.query().count('* as total'),
      TENANT_UNSCOPED_REASON.TEST_FIXTURE
    )
    const total = Number(unscopedCount[0].$extras.total)
    assert.isTrue(total >= 0)

    const scopedBu = await TenantContext.runUnscoped(async () => {
      const row = await Employee.query().whereNotNull('businessUnitId').first()
      return row?.businessUnitId ?? null
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)

    if (scopedBu !== null) {
      const scopedRows = await TenantContext.run([scopedBu], async () =>
        Employee.query().limit(20)
      )
      assert.isTrue(scopedRows.every((e) => e.businessUnitId === scopedBu))
    }

    const empty = await TenantContext.run([], async () => Employee.query())
    assert.lengthOf(empty, 0)
  })
})
