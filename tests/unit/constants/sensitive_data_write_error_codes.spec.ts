import { test } from '@japa/runner'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

test.group('SENSITIVE_DATA_WRITE_ERROR_CODES', () => {
  test('declara FORBIDDEN y UNRESOLVED con convención EMP.SENS.WRITE', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED, 'EMP.SENS.WRITE.UNRESOLVED')
  })

  test('no declara IMPORT_FORBIDDEN (lo emite la orden 33)', ({ assert }) => {
    assert.notProperty(SENSITIVE_DATA_WRITE_ERROR_CODES, 'IMPORT_FORBIDDEN')
  })
})

test.group('SensitiveDataWriteError', () => {
  test('es 403, expone categoría y no mete valores en el message', ({ assert }) => {
    const error = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    assert.equal(error.httpStatus, 403)
    assert.equal(error.errorCode, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(error.category, 'financiero')
    assert.notInclude(error.message.toLowerCase(), 'clabe')
    assert.notMatch(error.message, /\d{10,}/)
  })
})
