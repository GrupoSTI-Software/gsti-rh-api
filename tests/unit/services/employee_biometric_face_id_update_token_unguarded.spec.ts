import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('EmployeeBiometricFaceIdService.updateToken', () => {
  test('envuelve el save en runUnguarded con motivo de consulta de foto', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_biometric_face_id_service.ts'),
      'utf-8'
    )
    assert.include(source, 'SensitiveAccessContext.runUnguarded')
    assert.include(source, 'renovación del token biométrico en consulta de foto de rostro')
    const unguardedCount = source.split('runUnguarded').length - 1
    assert.equal(unguardedCount, 1)
  })
})
