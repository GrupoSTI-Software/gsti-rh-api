import { test } from '@japa/runner'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import EmployeeBiometricFaceIdService from '#services/employee_biometric_face_id_service'

test.group('EmployeeBiometricFaceIdService.replacePhoto', () => {
  test('propaga la denegación de escritura sensible de create', async ({ assert }) => {
    const service = new EmployeeBiometricFaceIdService()
    const denied = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'biometrico'
    )

    service.findByEmployeeId = async () => null
    service.create = async () => {
      throw denied
    }

    let thrown: unknown
    try {
      await service.replacePhoto(1, 'https://example.com/photo.jpg', {} as never)
    } catch (error) {
      thrown = error
    }

    assert.strictEqual(thrown, denied)
  })
})
