import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const FILES = [
  'app/controllers/work_disability_note_controller.ts',
  'app/controllers/traumatic_event_report_controller.ts',
  'app/controllers/employee_lactation_periods_controller.ts',
  'app/controllers/employee_spouse_controller.ts',
  'app/controllers/employee_emergency_contact_controller.ts',
  'app/controllers/position_salary_range_controller.ts',
  'app/controllers/employee_biometric_controller.ts',
  'app/controllers/employee_biometric_face_id_controller.ts',
  'app/models/employee_biometric.ts',
  'app/models/employee_biometric_face_id.ts',
  'app/models/employee_salary_history.ts',
  'app/models/position_salary_range.ts',
] as const

test.group('Swagger declara enmascaramiento condicional', () => {
  test('los controllers y schemas de esta rebanada mencionan el permiso o el null de importe', ({
    assert,
  }) => {
    for (const relative of FILES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf-8')
      const mentionsMask =
        source.includes('enmascarado según el permiso') ||
        source.includes('se entrega null, nunca enmascarado por partes')
      assert.isTrue(mentionsMask, `falta nota de enmascaramiento en ${relative}`)
    }
  })

  test('update de nota de incapacidad ya no marca la descripción como required', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/controllers/work_disability_note_controller.ts'),
      'utf-8'
    )
    const updateBlock = source.slice(source.indexOf('/api/work-disability-notes/{workDisabilityNoteId}:'))
    const descBlock = updateBlock.slice(
      updateBlock.indexOf('workDisabilityNoteDescription:'),
      updateBlock.indexOf('responses:')
    )
    assert.notInclude(descBlock, 'required: true')
  })
})
