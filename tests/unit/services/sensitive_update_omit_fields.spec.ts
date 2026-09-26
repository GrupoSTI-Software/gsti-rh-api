import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('update no vacía la columna sensible omitida', () => {
  test('nota de incapacidad solo asigna descripción si viene valor', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/work_disability_note_service.ts'),
      'utf-8'
    )
    assert.include(source, 'workDisabilityNote.workDisabilityNoteDescription !== undefined')
    assert.include(source, 'workDisabilityNote.workDisabilityNoteDescription !== null')
  })

  test('cónyuge y emergencia no asignan el teléfono si viene null', ({ assert }) => {
    const spouse = readFileSync(join(process.cwd(), 'app/services/employee_spouse_service.ts'), 'utf-8')
    const emergency = readFileSync(
      join(process.cwd(), 'app/services/employee_emergency_contact_service.ts'),
      'utf-8'
    )
    assert.include(spouse, 'employeeSpouse.employeeSpousePhone !== undefined')
    assert.include(spouse, 'employeeSpouse.employeeSpousePhone !== null')
    assert.include(emergency, 'employeeEmergencyContact.employeeEmergencyContactPhone !== undefined')
    assert.include(emergency, 'employeeEmergencyContact.employeeEmergencyContactPhone !== null')
  })
})
