import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

const files: Record<string, number> = {
  'app/controllers/person_controller.ts': 2,
  'app/controllers/employee_bank_controller.ts': 2,
  'app/controllers/employee_medical_condition_controller.ts': 2,
  'app/controllers/employee_emergency_contact_controller.ts': 2,
  'app/controllers/employee_spouse_controller.ts': 2,
  'app/controllers/work_disability_note_controller.ts': 2,
  'app/controllers/traumatic_event_report_controller.ts': 3,
  'app/controllers/employee_lactation_periods_controller.ts': 5,
  'app/controllers/employee_biometric_controller.ts': 4,
  // 4 desde que `useAsEmployeePhoto` guarda la foto de perfil: ese guardado
  // pasa por el mismo guard de categoria sensible que el resto, asi que tiene
  // que atrapar la negacion y responderla con triplete en vez de un 500.
  'app/controllers/employee_biometric_face_id_controller.ts': 4,
  'app/controllers/user_controller.ts': 2,
  'app/controllers/employee_controller.ts': 1,
}

test.group('Catch de SensitiveDataWriteError', () => {
  test('cada controller del censo llama al helper el número de veces esperado', ({ assert }) => {
    let total = 0
    for (const [relative, expected] of Object.entries(files)) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'isSensitiveDataWriteError', relative)
      assert.include(source, 'respondSensitiveDataWriteDenial', relative)
      const count = source.split('isSensitiveDataWriteError').length - 1
      assert.equal(count, expected + 1, `${relative} import + ${expected} catch`)
      total += expected
    }
    assert.equal(total, 31)
  })
})
