import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const MODELS = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
] as const

const TEXT_WIRING: Array<{ file: string; model: string; columns: string[] }> = [
  { file: 'app/models/employee_biometric.ts', model: 'EmployeeBiometric', columns: ['employeeBiometricData'] },
  {
    file: 'app/models/employee_biometric_face_id.ts',
    model: 'EmployeeBiometricFaceId',
    columns: ['employeeBiometricFaceIdToken', 'employeeBiometricFaceIdPhotoUrl'],
  },
  {
    file: 'app/models/work_disability_note.ts',
    model: 'WorkDisabilityNote',
    columns: ['workDisabilityNoteDescription'],
  },
  {
    file: 'app/models/traumatic_event_report.ts',
    model: 'TraumaticEventReport',
    columns: ['traumaticEventReportInvolvedPeople', 'traumaticEventReportDescription'],
  },
  {
    file: 'app/models/employee_lactation_period.ts',
    model: 'EmployeeLactationPeriod',
    columns: ['employeeLactationPeriodNotes'],
  },
  {
    file: 'app/models/employee_emergency_contact.ts',
    model: 'EmployeeEmergencyContact',
    columns: ['employeeEmergencyContactPhone'],
  },
  { file: 'app/models/employee_spouse.ts', model: 'EmployeeSpouse', columns: ['employeeSpousePhone'] },
  {
    file: 'app/models/user_consent.ts',
    model: 'UserConsent',
    columns: ['userConsentIp', 'userConsentUserAgent'],
  },
  { file: 'app/models/empresa_contratante.ts', model: 'EmpresaContratante', columns: ['rfc'] },
]

test.group('Wiring sensitiveSerialize en Person, EmployeeBank y EmployeeMedicalCondition', () => {
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

test.group('Wiring sensitiveSerialize en las 12 columnas de texto de orden 31', () => {
  test('cada modelo importa la fábrica y cablea sus columnas', ({ assert }) => {
    for (const entry of TEXT_WIRING) {
      const source = readFileSync(join(process.cwd(), entry.file), 'utf-8')
      assert.include(source, "import { sensitiveSerialize } from '#helpers/sensitive_serialize'")
      assert.notInclude(source, 'maskSensitiveValue')
      for (const column of entry.columns) {
        assert.include(source, `sensitiveSerialize('${entry.model}', '${column}')`)
      }
    }
  })

  test('el proxy de la foto facial no usa sensitiveSerialize', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/models/employee_biometric_face_id.ts'),
      'utf-8'
    )
    assert.notInclude(source, "sensitiveSerialize('EmployeeBiometricFaceId', 'employeeBiometricFaceIdPhotoUrlProxy')")
  })
})

test.group('Wiring sensitiveSerializeNumeric en los 7 importes', () => {
  test('histórico, rango vigente y bitácora usan la rama numérica, no maskLastFour', ({ assert }) => {
    const history = readFileSync(join(process.cwd(), 'app/models/employee_salary_history.ts'), 'utf-8')
    const range = readFileSync(join(process.cwd(), 'app/models/position_salary_range.ts'), 'utf-8')
    const audit = readFileSync(
      join(process.cwd(), 'app/models/position_salary_range_audit.ts'),
      'utf-8'
    )

    assert.include(history, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(range, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(audit, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")

    assert.include(history, "sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')")
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMinSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMaxSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMinSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMaxSalaryDaily')"
    )

    assert.notInclude(history, 'sensitiveSerialize(')
    assert.notInclude(range, 'sensitiveSerialize(')
    assert.notInclude(audit, 'sensitiveSerialize(')
    assert.notInclude(audit, 'maskLastFour')
  })
})
