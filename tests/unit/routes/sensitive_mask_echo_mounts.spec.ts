import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

const WRITE_ROUTE_FILES = [
  'start/routes/person_routes.ts',
  'start/routes/employee_bank_routes.ts',
  'start/routes/employee_medical_condition_routes.ts',
  'start/routes/employee_emergency_contact_routes.ts',
  'start/routes/employee_spouse_routes.ts',
  'start/routes/work_disability_note_routes.ts',
  'start/routes/traumatic_event_report_routes.ts',
  'start/routes/traumatic_event_report_v1_routes.ts',
  'start/routes/employee_lactation_periods_routes.ts',
  'start/routes/employee_biometric_routes.ts',
  'start/routes/employee_biometric_face_id_routes.ts',
  'start/routes/user_routes.ts',
  'start/routes/employee_routes.ts',
  'start/routes/synchronization_routes.ts',
  'start/routes/pilot_routes.ts',
  'start/routes/flight_attendant_routes.ts',
  'start/routes/customer_routes.ts',
]

test.group('Montaje sensitiveMaskEcho', () => {
  test('kernel registra sensitiveMaskEcho', ({ assert }) => {
    const kernel = readFileSync(join(ROOT, 'start/kernel.ts'), 'utf-8')
    assert.include(kernel, 'sensitiveMaskEcho:')
    assert.include(kernel, '#middleware/sensitive_mask_echo_middleware')
  })

  test('cada archivo de escritura del expediente monta sensitiveMaskEcho', ({ assert }) => {
    for (const relative of WRITE_ROUTE_FILES) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'middleware.sensitiveMaskEcho()', `${relative} debe montar sensitiveMaskEcho`)
    }
  })

  test('person_routes monta sensitiveMaskEcho solo en /api/persons', ({ assert }) => {
    const source = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    assert.match(source, /prefix\('\/api\/persons'\)[\s\S]*?sensitiveMaskEcho\(\)/)
    const getEmployeeBlock = source.slice(source.indexOf("prefix('/api/person-get-employee')"))
    assert.notInclude(getEmployeeBlock.split("prefix('/api/persons-get-places")[0], 'sensitiveMaskEcho()')
  })
})
