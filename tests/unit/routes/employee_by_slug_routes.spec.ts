import { test } from '@japa/runner'
import { compactSource, readSource } from '#tests/helpers/route_gate_assertions'

/**
 * Resolución del empleado por su slug opaco.
 *
 * El Backoffice lleva el slug en la URL del navegador para no exponer el
 * nombre ni el código de nómina en el historial, en los logs de proxy ni en el
 * header `Referer`. Necesita un punto donde canjearlo por el empleado; de ahí
 * en adelante sigue trabajando con `employeeId` como hasta hoy.
 *
 * Espeja a `/get-by-id/:employeeId`: sin gate en la ruta porque el permiso se
 * resuelve dentro del controlador con `ensureEmployeeTabRead`, que necesita el
 * id del empleado ya resuelto para saber qué pestañas puede leer quien pregunta.
 * La autorización de verdad la ponen `auth()` y `businessScope()` del prefijo.
 */

const ROUTES_FILE = 'start/routes/employee_routes.ts'
const CONTROLLER_FILE = 'app/controllers/employee_controller.ts'

test.group('Empleado por slug — ruta', () => {
  test('la ruta existe y apunta al controlador de empleados', ({ assert }) => {
    const flat = compactSource(readSource(ROUTES_FILE))
    assert.include(
      flat,
      compactSource(
        'router.get(\'/get-by-slug/:employeeSlug\', \'#controllers/employee_controller.getBySlug\')'
      ),
      'debe existir GET /api/employees/get-by-slug/:employeeSlug'
    )
  })

  test('se declara antes de los comodines /:employeeId', ({ assert }) => {
    const flat = compactSource(readSource(ROUTES_FILE))
    const bySlug = flat.indexOf(compactSource('\'/get-by-slug/:employeeSlug\''))
    const wildcard = flat.indexOf(compactSource('router.get(\'/:employeeId\''))
    assert.isAbove(bySlug, -1)
    assert.isAbove(wildcard, -1)
    assert.isBelow(bySlug, wildcard, 'un comodín declarado antes se tragaría la ruta')
  })

  test('el controlador resuelve el permiso con ensureEmployeeTabRead', ({ assert }) => {
    const source = readSource(CONTROLLER_FILE)
    const start = source.indexOf('async getBySlug(')
    assert.isAbove(start, -1, 'debe existir el método getBySlug')

    const body = source.slice(start, start + 4000)
    assert.include(body, 'ensureEmployeeTabRead', 'mismo gate que getById')
    assert.include(
      body,
      'EMPLOYEES_READ_PERMISSION_DECLARATIONS.getEmployeeById',
      'es el mismo recurso: reusa la declaración de getById'
    )
    assert.include(body, 'response.status(404)', 'un slug inexistente responde 404')
  })

  test('el servicio expone la búsqueda por slug', ({ assert }) => {
    const source = readSource('app/services/employee_service.ts')
    assert.include(source, 'async getBySlug(', 'debe existir EmployeeService.getBySlug')
  })
})
