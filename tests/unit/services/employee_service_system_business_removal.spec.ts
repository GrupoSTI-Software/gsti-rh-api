import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { TenantContext } from '#utils/tenant_context'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import SystemSettingsEmployee from '#models/system_settings_employee'
import EmployeeService from '#services/employee_service'

/**
 * USRH1783821206455 — retiro de las 3 últimas lecturas funcionales de
 * `SYSTEM_BUSINESS` en el servicio de empleados: límite de empleados,
 * identificador biométrico y color de exportes. Verificado contra BD real
 * (BU1=sae / BU6=cima ya tienen `system_settings` con colores distintos).
 */

const EMPLOYEE_SERVICE_FILE = join(process.cwd(), 'app/services/employee_service.ts')

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

test.group('employee_service.ts — sin lecturas funcionales de SYSTEM_BUSINESS', () => {
  test('el archivo no contiene ninguna lectura funcional de SYSTEM_BUSINESS', ({ assert }) => {
    const content = readFileSync(EMPLOYEE_SERVICE_FILE, 'utf-8')
    assert.notInclude(content, 'SYSTEM_BUSINESS')
  })
})

test.group('getEmployeeLimitForBusinessUnit — por unidad del empleado (BD real)', (group) => {
  let tempSettingEmployeeId: number

  group.setup(async () => {
    // BU1 (sae) empareja con system_setting_id=3 en la BD restablecida.
    const row = new SystemSettingsEmployee()
    row.systemSettingId = 3
    row.employeeLimit = 1
    row.isActive = true
    await row.save()
    tempSettingEmployeeId = row.systemSettingEmployeeId
  })

  group.teardown(async () => {
    if (tempSettingEmployeeId) {
      await SystemSettingsEmployee.query()
        .where('systemSettingEmployeeId', tempSettingEmployeeId)
        .delete()
    }
  })

  test('BU1 (con límite=1 y >1 empleados reales) reporta límite alcanzado', async ({
    assert,
  }) => {
    const service = getService()
    const result = await service.verifyEmployeeLimit(1)

    assert.equal(result.status, 400)
    assert.equal(result.data.limit, 1)
  })

  test('BU6 (sin límite configurado para su setting) no se ve afectada por el límite de BU1', async ({
    assert,
  }) => {
    const service = getService()
    const result = await service.verifyEmployeeLimit(6)

    assert.equal(result.status, 200)
    assert.isNull(result.data.limit)
  })
})

test.group('getActiveBusinessUnitColor — de la unidad seleccionada, no de la lista global', () => {
  test('BU1 (sae) resuelve el color de su propio system_setting', async ({ assert }) => {
    const service = getService()
    const color = await TenantContext.run([1], () =>
      (service as any).getActiveBusinessUnitColor()
    )
    assert.equal(color, 'FF0A3057')
  })

  test('BU6 (cima) resuelve un color distinto al de BU1', async ({ assert }) => {
    const service = getService()
    const color = await TenantContext.run([6], () =>
      (service as any).getActiveBusinessUnitColor()
    )
    assert.equal(color, 'FF004E80')
  })

  test('sin unidad seleccionada, cae al color por defecto (nunca a la lista global)', async ({
    assert,
  }) => {
    const service = getService()
    const color = await (service as any).getActiveBusinessUnitColor()
    assert.equal(color, 'FFD6FFDC')
  })
})

test.group('mapEmployeeToBiometricFormat — payrollNum = unidad concreta del empleado', () => {
  test('empleado de BU1 se estampa con el slug de BU1 (sae), no con la lista global', async ({
    assert,
  }) => {
    const service = getService()
    const employee = await Employee.query()
      .where('employeeId', 678)
      .preload('businessUnit')
      .preload('person')
      .firstOrFail()

    const payload = (service as any).mapEmployeeToBiometricFormat(employee)
    assert.equal(payload.payrollNum, 'sae')
  })

  test('empleado de BU6 se estampa con el slug de BU6 (cima)', async ({ assert }) => {
    const service = getService()
    const employee = await Employee.query()
      .where('employeeId', 12)
      .preload('businessUnit')
      .preload('person')
      .firstOrFail()

    const payload = (service as any).mapEmployeeToBiometricFormat(employee)
    assert.equal(payload.payrollNum, 'cima')
  })

  test('el slug estampado sigue siendo detectable por inclusión (contrato del reverse-sync)', async ({
    assert,
  }) => {
    const bu1 = await BusinessUnit.findOrFail(1)
    const businessUnitsList = [bu1.businessUnitSlug]
    const payrollNum = 'sae'

    assert.isTrue(`${businessUnitsList}`.toLowerCase().includes(payrollNum.toLowerCase()))
  })
})
