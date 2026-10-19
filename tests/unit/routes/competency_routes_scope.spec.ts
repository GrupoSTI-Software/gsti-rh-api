import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * VLRH-H1792026427127 — el catálogo de competencias era global: sus rutas
 * tenían auth() pero no businessScope(). El candado es obligatorio.
 */

const ROUTES_DIR = join(process.cwd(), 'start/routes')

const ROUTE_FILES = [
  'competency_routes.ts',
  'competency_descriptor_routes.ts',
  'competency_bracket_routes.ts',
] as const

test.group('Competencias — rutas con auth + businessScope', () => {
  for (const fileName of ROUTE_FILES) {
    test(`${fileName} monta auth() y businessScope()`, ({ assert }) => {
      const content = readFileSync(join(ROUTES_DIR, fileName), 'utf-8')
      assert.include(content, 'middleware.auth()')
      assert.include(content, 'middleware.businessScope()')
    })
  }
})
