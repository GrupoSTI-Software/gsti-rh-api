import { test } from '@japa/runner'
import { isRequestEntityTooLarge } from '../../../app/helpers/employee_import_request_errors.js'
import { isEmployeeImportExcelPath } from '../../../app/constants/employee_import_error_codes.js'

test.group('employee_import upload guards', () => {
  test('isEmployeeImportExcelPath reconoce la ruta del import', ({ assert }) => {
    assert.isTrue(isEmployeeImportExcelPath('/api/employees/import-excel'))
    assert.isFalse(isEmployeeImportExcelPath('/api/employees/template-excel'))
  })

  test('isRequestEntityTooLarge detecta 413 del bodyparser', ({ assert }) => {
    assert.isTrue(isRequestEntityTooLarge({ status: 413, message: 'request entity too large' }))
    assert.isFalse(isRequestEntityTooLarge({ status: 400, message: 'bad request' }))
  })
})
