import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('noMaskCharRule en las 5 validaciones nuevas', () => {
  test('incapacidad: create requerido + guard; update optional + guard', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/validators/work_disability_note.ts'), 'utf-8')
    assert.include(source, "import { noMaskCharRule } from './no_mask_char_rule.js'")
    assert.match(
      source,
      /workDisabilityNoteDescription:\s*vine\.string\(\)\.trim\(\)\.minLength\(1\)\.use\(noMaskCharRule\(\)\)/
    )
    assert.match(
      source,
      /workDisabilityNoteDescription:\s*vine\.string\(\)\.trim\(\)\.minLength\(1\)\.use\(noMaskCharRule\(\)\)\.optional\(\)/
    )
  })

  test('cónyuge, emergencia, trauma y lactancia montan el guard', ({ assert }) => {
    const spouse = readFileSync(join(process.cwd(), 'app/validators/employee_spouse.ts'), 'utf-8')
    const emergency = readFileSync(
      join(process.cwd(), 'app/validators/employee_emergency_contact.ts'),
      'utf-8'
    )
    const trauma = readFileSync(join(process.cwd(), 'app/validators/traumatic_event_report.ts'), 'utf-8')
    const lactation = readFileSync(
      join(process.cwd(), 'app/validators/employee_lactation_period.ts'),
      'utf-8'
    )
    for (const source of [spouse, emergency, trauma, lactation]) {
      assert.include(source, 'noMaskCharRule')
    }
    assert.include(lactation, 'lactationPeriodNotesField')
    assert.match(lactation, /noMaskCharRule\(\)/)
  })
})
