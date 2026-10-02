import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Aislamiento entre clientes de las solicitudes de permiso, en dos capas.
 *
 * ## La capa que manda: la marca propia
 * `exception_requests` tiene `business_unit_id` y el modelo compone
 * `withBusinessUnitScope`, asi que el filtro por empresa lo aplica el modelo en
 * TODA consulta, sin que nadie tenga que escribirlo. Es lo que cierra el hueco
 * de raiz: antes la tabla no tenia la columna y el aislamiento dependia de que
 * cada query recordara su corte a mano.
 *
 * ## La capa que queda: el corte por empleado
 * `whereIn('employee_id', scopedEmployeeIds())` se conserva como defensa en
 * profundidad. Importa porque el mixin NO filtra cuando no hay contexto de
 * tenant activo —una ruta fuera de `businessScope()` seguiria devolviendo de
 * mas, en silencio— y porque `scopedEmployeeIds` ancla el resultado al
 * expediente, no solo a la empresa de la fila.
 *
 * Aqui se vigilan las dos: que el middleware siga en el grupo, que ninguna ruta
 * nazca fuera de el, que el modelo conserve el mixin y la marca, y que las
 * lecturas de terceros mantengan su corte.
 */
const ROUTES = join(process.cwd(), 'start/routes/exception_request_routes.ts')
const CONTROLLER = join(process.cwd(), 'app/controllers/exception_requests_controller.ts')
const MODEL = join(process.cwd(), 'app/models/exception_request.ts')

/** Metodos del controlador que leen o tocan solicitudes de terceros. */
const METODOS_CON_ALCANCE_DE_TERCEROS = [
  'index',
  'show',
  'update',
  'destroy',
  'updateStatus',
  'resolveBatch',
  'decisionContext',
  'indexAllExceptionRequests',
  'getUnreadExceptionRequests',
] as const

/** Cuerpo del metodo indicado, acotado al siguiente metodo del controlador. */
function metodo(contenido: string, nombre: string): string {
  const inicio = contenido.indexOf(`\n  async ${nombre}(`)
  if (inicio === -1) return ''

  const resto = contenido.slice(inicio + 1)
  const cortes = ['\n  async ', '\n  private async ']
    .map((marca) => resto.indexOf(marca, 10))
    .filter((posicion) => posicion !== -1)
    .sort((a, b) => a - b)

  return cortes.length === 0 ? resto : resto.slice(0, cortes[0])
}

test.group('Solicitudes de permiso — corte por tenant', () => {
  test('el modelo lleva la marca de empresa y el mixin que la filtra', ({ assert }) => {
    const modelo = readFileSync(MODEL, 'utf-8')

    assert.include(
      modelo,
      'withBusinessUnitScope()',
      'sin el mixin, el filtro por empresa vuelve a depender de que cada query lo escriba'
    )
    assert.include(modelo, 'declare businessUnitId: number')
    assert.include(
      modelo,
      '@beforeCreate()',
      'la empresa se resuelve desde el empleado al crear; sin el hook el INSERT violaria el NOT NULL'
    )
    assert.include(modelo, 'resolveParentBusinessUnitId(')
  })

  test('el grupo de rutas abre el contexto de empresa', ({ assert }) => {
    const rutas = readFileSync(ROUTES, 'utf-8')

    assert.include(
      rutas,
      '.use(middleware.businessScope())',
      'sin businessScope el corte por empleado no se aplica y el modulo devuelve todas las empresas'
    )
    assert.include(rutas, '.use(middleware.auth())')
  })

  test('todas las rutas del modulo viven dentro del mismo grupo', ({ assert }) => {
    const rutas = readFileSync(ROUTES, 'utf-8')

    // Un solo `router.group(` y un solo `.prefix(`: dos grupos permitirian que
    // el segundo naciera sin los middlewares del primero.
    assert.equal(
      rutas.split('router\n  .group(').length - 1,
      1,
      'un segundo grupo podria quedarse sin businessScope'
    )
    assert.equal(rutas.split(".prefix('/api/exception-requests')").length - 1, 1)
  })

  test('cada lectura de solicitudes ajenas acota por los empleados de la empresa', ({
    assert,
  }) => {
    const controlador = readFileSync(CONTROLLER, 'utf-8')

    for (const nombre of METODOS_CON_ALCANCE_DE_TERCEROS) {
      const cuerpo = metodo(controlador, nombre)

      assert.isNotEmpty(cuerpo, `no se encontro el metodo ${nombre}`)
      assert.include(
        cuerpo,
        'scopedEmployeeIds()',
        `${nombre} lee solicitudes sin acotar por los empleados de la empresa activa`
      )
    }
  })

  test('el alta valida el empleado contra la empresa activa', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), 'store')

    const consulta = cuerpo.indexOf('const employee = await Employee.query()')
    const alcance = cuerpo.indexOf('scopedEmployeeIds()')

    assert.isAbove(consulta, -1)
    assert.isAbove(
      alcance,
      consulta,
      'el employeeId del cuerpo debe validarse contra la empresa activa antes de crear'
    )
  })

  test('los adjuntos se acotan tambien por su propia marca de empresa', ({ assert }) => {
    const controlador = readFileSync(CONTROLLER, 'utf-8')

    // `exception_request_attachments` SI tiene `business_unit_id`: se usa como
    // defensa en profundidad ademas del corte por empleado. Sin empresa
    // resuelta no se sirve ni se guarda nada (fail-closed).
    assert.include(controlador, 'businessUnitId: scope.businessUnitId')
    assert.include(controlador, 'resolveRequestBusinessUnitId(ctx)')
    assert.include(
      controlador,
      "body: { error: 'The active company could not be resolved.' }",
      'un contexto sin empresa debe cerrar la puerta, no servir el archivo'
    )
  })
})
