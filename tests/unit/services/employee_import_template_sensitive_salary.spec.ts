import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { SENSITIVE_EXPORT_PLACEHOLDER } from '#constants/sensitive_export_placeholder'
import EmployeeService from '#services/employee_service'

function service() {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

type ServiceWithTemplateNumeric = {
  templateSensitiveNumericCellValue(
    maskSensitive: boolean | undefined,
    value: number | null | undefined
  ): string | number
}

test.group('Plantilla Excel importación — salario diario sensible (USRH1787433076994)', () => {
  test('templateSensitiveNumericCellValue enmascara o devuelve el importe según permiso', ({
    assert,
  }) => {
    const svc = service() as unknown as ServiceWithTemplateNumeric

    assert.equal(svc.templateSensitiveNumericCellValue(true, 850.5), SENSITIVE_EXPORT_PLACEHOLDER)
    assert.equal(svc.templateSensitiveNumericCellValue(true, null), SENSITIVE_EXPORT_PLACEHOLDER)
    assert.equal(svc.templateSensitiveNumericCellValue(false, 850.5), 850.5)
    assert.equal(svc.templateSensitiveNumericCellValue(undefined, 850.5), 850.5)
    assert.equal(svc.templateSensitiveNumericCellValue(false, null), 0)
    assert.equal(svc.templateSensitiveNumericCellValue(undefined, null), 0)
  })
})
