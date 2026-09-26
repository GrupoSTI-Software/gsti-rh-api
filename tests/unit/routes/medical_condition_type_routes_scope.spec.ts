import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1784259058487 (ampliación) — las rutas de tipos médicos estaban abiertas
 * (sin auth ni businessScope). El candado es obligatorio.
 */

const ROUTES_DIR = join(process.cwd(), 'start/routes')

const ROUTE_FILES = [
  'medical_condition_type_routes.ts',
  'medical_condition_type_property_routes.ts',
  'medical_condition_type_property_value_routes.ts',
  'employee_medical_condition_routes.ts',
] as const

test.group('Tipos médicos — rutas con auth + businessScope', () => {
  for (const fileName of ROUTE_FILES) {
    test(`${fileName} monta auth() y businessScope()`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')
      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })
  }
})
