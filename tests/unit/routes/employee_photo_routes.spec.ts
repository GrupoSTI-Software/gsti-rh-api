import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * La salida de la foto reemplaza a `GET /api/proxy-image`, que era pública y
 * recibía la ruta del archivo por query param. Esta suite fija las dos
 * propiedades que hacían falta: que el endpoint esté detrás de los candados y
 * que el proxy no vuelva.
 */
function compact(content: string): string {
  return content.replace(/\s+/g, '')
}

test.group('employee_photo_routes — salida de archivos autenticada', () => {
  test('el grupo monta auth() y businessScope()', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_photo_routes.ts'),
      'utf-8'
    )

    assert.include(compact(content), '.use(middleware.auth())')
    assert.include(compact(content), '.use(middleware.businessScope())')
  })

  test('la lectura declara permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_photo_routes.ts'),
      'utf-8'
    )

    assert.match(
      compact(content),
      /get\('\/:employeeId\/photo','#controllers\/employee_photo_stream_controller\.show'\)\.use\(middleware\.permissionGate/
    )
  })

  test('la ruta está registrada en el router principal', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes.ts'), 'utf-8')

    assert.include(content, "import './routes/employee_photo_routes.js'")
  })

  test('el SSRF de proxy-image no vuelve al arbol de rutas', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_routes.ts'), 'utf-8')

    assert.notInclude(content, 'proxy-image')
    assert.notInclude(content, 'proxyImage')
  })

  test('el controlador resuelve la clave desde el recurso, no del cliente', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/employee_photo_stream_controller.ts'),
      'utf-8'
    )

    // La referencia sale del registro del empleado.
    assert.include(content, 'employee.employeePhoto')
    // Y nunca de la petición: ni query param ni body con rutas o URLs.
    assert.notInclude(content, "request.input('url')")
    assert.notInclude(content, 'request.qs()')
  })
})
