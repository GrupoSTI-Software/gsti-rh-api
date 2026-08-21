import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('DTO que no pasan por serialize', () => {
  test('empresa contratante enmascara rfc con la fábrica, no con un literal de categoría', ({
    assert,
  }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/empresa_contratante_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.include(source, "maskSensitiveDtoValue('EmpresaContratante', 'rfc',")
    assert.notMatch(source, /rfc:\s*row\.rfc/)
    assert.notMatch(source, /canRead\('identificacion'\)/)
  })

  test('enrolamiento y estado enmascaran biometricData con la fábrica', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_biometric_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.include(
      source,
      "maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData'"
    )
    assert.notMatch(source, /biometricData:\s*employeeBiometric\.employeeBiometricData/)
    assert.notMatch(source, /canRead\('biometrico'\)/)
  })
})
