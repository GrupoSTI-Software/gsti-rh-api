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
})
