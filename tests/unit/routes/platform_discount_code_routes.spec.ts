import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * USRH1787714804397 — el catálogo de códigos de descuento es dato de
 * plataforma: sus rutas deben llevar `auth` + `platformAdmin`, nunca
 * `businessScope()` (no pertenece a ninguna empresa cliente).
 */

const ROUTES_PATH = 'start/routes/platform_discount_code_routes.ts'

test.group('platform_discount_code_routes — guard de plataforma', () => {
  test('el grupo completo usa auth + platformAdmin', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, 'middleware.auth(')
    assert.include(content, 'middleware.platformAdmin()')
  })

  test('nunca declara businessScope() — no es dato de tenant', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.notInclude(content, 'businessScope')
  })

  test('declara las 6 rutas del catálogo', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_PATH), 'utf8')
    assert.include(content, "router.get('/discount-codes', '#controllers/discount_code_controller.index')")
    assert.include(
      content,
      "router.get(\n      '/discount-codes/:discountCodeId',\n      '#controllers/discount_code_controller.show'\n    )"
    )
    assert.include(content, "router.post('/discount-codes', '#controllers/discount_code_controller.store')")
    assert.include(
      content,
      "router.patch(\n      '/discount-codes/:discountCodeId',\n      '#controllers/discount_code_controller.update'\n    )"
    )
    assert.include(content, 'discount_code_controller.activate')
    assert.include(content, 'discount_code_controller.deactivate')
  })
})

test.group('start/routes.ts — registro del módulo', () => {
  test('platform_discount_code_routes.js está importado', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf8')
    assert.include(content, "import './routes/platform_discount_code_routes.js'")
  })
})
