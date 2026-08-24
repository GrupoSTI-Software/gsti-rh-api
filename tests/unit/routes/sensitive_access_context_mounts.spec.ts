import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

test.group('Apertura del contexto de lectura sensible', () => {
  test('kernel registra sensitiveAccess', ({ assert }) => {
    const kernel = readFileSync(join(ROOT, 'start/kernel.ts'), 'utf-8')
    assert.include(kernel, 'sensitiveAccess:')
    assert.include(kernel, '#middleware/sensitive_access_context_middleware')
  })

  test('businessScope anida runWithSensitiveReadDecisions dentro de TenantContext.run', ({
    assert,
  }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_middleware.ts'),
      'utf-8'
    )
    assert.include(source, 'runWithSensitiveReadDecisions')
    assert.include(source, 'TenantContext.run')
  })

  test('businessScopeOptional anida la apertura en sus dos retornos', ({ assert }) => {
    const source = readFileSync(
      join(ROOT, 'app/middleware/business_unit_scope_optional_middleware.ts'),
      'utf-8'
    )
    const occurrences = source.split('runWithSensitiveReadDecisions').length - 1
    assert.equal(occurrences, 3)
  })

  test('los cuatro grupos con solo auth() montan sensitiveAccess y no businessScope', ({
    assert,
  }) => {
    const files = [
      'start/routes/person_routes.ts',
      'start/routes/customer_routes.ts',
      'start/routes/pilot_routes.ts',
      'start/routes/flight_attendant_routes.ts',
    ]
    for (const relative of files) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'middleware.sensitiveAccess()', relative)
    }

    const persons = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    assert.include(persons, "prefix('/api/persons')")
    assert.match(
      persons,
      /prefix\('\/api\/persons'\)[\s\S]*?\.use\(middleware\.auth\(\)\)[\s\S]*?\.use\(middleware\.sensitiveAccess\(\)\)/
    )
  })

  test('rutas de escritura de los 10 modelos abren businessScope o sensitiveAccess', ({
    assert,
  }) => {
    const writeRouteFiles = [
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
    ]
    for (const relative of writeRouteFiles) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      const hasBusiness = source.includes('middleware.businessScope()')
      const hasSensitive = source.includes('middleware.sensitiveAccess()')
      assert.isTrue(
        hasBusiness || hasSensitive,
        `${relative} debe montar businessScope o sensitiveAccess`
      )
    }
  })

  test('la consola landlord no abre contexto sensible (hueco declarado)', ({ assert }) => {
    const source = readFileSync(join(ROOT, 'start/routes/platform_routes.ts'), 'utf-8')
    assert.notInclude(source, 'middleware.businessScope()')
    assert.notInclude(source, 'middleware.sensitiveAccess()')
  })
})
