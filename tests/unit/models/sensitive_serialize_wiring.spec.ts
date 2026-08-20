import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const MODELS = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
] as const

test.group('Wiring sensitiveSerialize en los 3 modelos', () => {
  test('los tres modelos importan sensitiveSerialize y no maskSensitiveValue', ({ assert }) => {
    for (const relative of MODELS) {
      const source = readFileSync(join(process.cwd(), relative), 'utf-8')
      assert.include(source, "import { sensitiveSerialize } from '#helpers/sensitive_serialize'")
      assert.notInclude(source, 'maskSensitiveValue')
    }
  })

  test('Person serializa las 6 columnas con la fábrica y el nombre de columna', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/models/person.ts'), 'utf-8')
    for (const column of [
      'personPhone',
      'personEmail',
      'personPhoneSecondary',
      'personCurp',
      'personRfc',
      'personImssNss',
    ]) {
      assert.include(source, `sensitiveSerialize('Person', '${column}')`)
    }
  })

  test('EmployeeBank serializa las 3 columnas financieras', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/models/employee_bank.ts'), 'utf-8')
    for (const column of [
      'employeeBankAccountClabe',
      'employeeBankAccountNumber',
      'employeeBankAccountCardNumber',
    ]) {
      assert.include(source, `sensitiveSerialize('EmployeeBank', '${column}')`)
    }
  })

  test('EmployeeMedicalCondition serializa diagnóstico y notas', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/models/employee_medical_condition.ts'),
      'utf-8'
    )
    assert.include(
      source,
      "sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis')"
    )
    assert.include(
      source,
      "sensitiveSerialize('EmployeeMedicalCondition', 'employeeMedicalConditionNotes')"
    )
  })

  test('cero literales de categoría en serialize de app/models', ({ assert }) => {
    for (const relative of MODELS) {
      const source = readFileSync(join(process.cwd(), relative), 'utf-8')
      assert.notMatch(source, /maskSensitiveValue\([^)]*'/)
    }
  })
})
