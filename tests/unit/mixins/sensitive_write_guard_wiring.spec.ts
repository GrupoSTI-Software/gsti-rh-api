import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

const models = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
  'app/models/employee_emergency_contact.ts',
  'app/models/employee_spouse.ts',
  'app/models/work_disability_note.ts',
  'app/models/traumatic_event_report.ts',
  'app/models/employee_lactation_period.ts',
  'app/models/employee_biometric.ts',
  'app/models/employee_biometric_face_id.ts',
]

test.group('Cableado withSensitiveWriteGuard', () => {
  test('los 10 modelos importan y componen el mixin de escritura sensible', ({ assert }) => {
    for (const relative of models) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, "from '#mixins/with_sensitive_write_guard'", relative)
      assert.include(source, 'withSensitiveWriteGuard()', relative)
    }
  })
})
