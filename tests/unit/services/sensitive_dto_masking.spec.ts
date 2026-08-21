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

  test('lactancia enmascara notas con la fábrica, no con un literal de categoría', ({
    assert,
  }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_lactation_period_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.match(
      source,
      /maskSensitiveDtoValue\(\s*'EmployeeLactationPeriod',\s*'employeeLactationPeriodNotes'/
    )
    assert.notMatch(source, /employeeLactationPeriodNotes:\s*period\.employeeLactationPeriodNotes/)
    assert.notMatch(source, /canRead\('salud'\)/)
  })

  test('ATS enmascara involucrados y descripcion con la fábrica', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/traumatic_event_report_service.ts'),
      'utf-8'
    )
    assert.include(source, "import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'")
    assert.match(
      source,
      /maskSensitiveDtoValue\(\s*'TraumaticEventReport',\s*'traumaticEventReportInvolvedPeople'/
    )
    assert.match(
      source,
      /maskSensitiveDtoValue\(\s*'TraumaticEventReport',\s*'traumaticEventReportDescription'/
    )
    assert.notMatch(
      source,
      /traumaticEventReportInvolvedPeople:\s*report\.traumaticEventReportInvolvedPeople/
    )
    assert.notMatch(
      source,
      /traumaticEventReportDescription:\s*report\.traumaticEventReportDescription/
    )
    assert.notMatch(source, /canRead\('salud'\)/)
  })
})
