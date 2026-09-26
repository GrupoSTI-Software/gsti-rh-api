import { test } from '@japa/runner'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'

test.group('SENSITIVE_DATA_READ_ERROR_CODES', () => {
  test('declara las dos constantes que emite el revelado', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE, 'EMP.SENS.READ.NOT_REVEALABLE')
    assert.equal(SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED, 'EMP.SENS.READ.NOT_CLASSIFIED')
  })
})
