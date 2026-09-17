import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import EmployeeService from '#services/employee_service'

/**
 * USRH1788466831270 — `verifyInfoExist` (lo que comparte alta y edición) ya
 * no exige departamento ni puesto (regla 1). Sobre la base de desarrollo;
 * `employeeTypeId: 1` es el tipo "Empleado" que siembra
 * `0011_employee_type_seeder.ts`.
 */

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

test.group('EmployeeService.verifyInfoExist — sin estructura (USRH1788466831270)', (group) => {
  let unit: BusinessUnit

  function service(): EmployeeService {
    return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
  }

  /** Literal equivalente al que arma el controller; sin departamento ni puesto. */
  function payload(extra: Partial<Employee> = {}): Employee {
    return {
      employeeId: 0,
      employeeCode: `VIE-${stamp()}`,
      departmentId: null,
      positionId: null,
      personId: null,
      employeeTypeId: 1,
      businessUnitId: unit.businessUnitId,
      payrollBusinessUnitId: unit.businessUnitId,
      ...extra,
    } as Employee
  }

  group.setup(async () => {
    const s = stamp()
    unit = await BusinessUnit.create({
      businessUnitName: `VerifyInfo ${s}`,
      businessUnitSlug: `verify-info-${s}`,
      businessUnitLegalName: `VerifyInfo legal ${s}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
  })

  group.teardown(async () => {
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  })

  test('verifyInfoExist pasa sin departamento ni puesto (regla 1)', async ({ assert }) => {
    const result = await service().verifyInfoExist(payload())

    assert.equal(result.status, 200)
  })

  test('verifyInfoExist sigue rechazando lo demás: tipo de empleado inexistente', async ({
    assert,
  }) => {
    const result = await service().verifyInfoExist(payload({ employeeTypeId: 2_000_000_000 }))

    assert.equal(result.status, 400)
    assert.equal(result.title, 'The employee type was not found')
  })
})
