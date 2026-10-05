import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * El alta de solicitudes de permiso es la única entrada del módulo exenta de
 * `permissionGate` (D-08), porque la comparten el backoffice —Recursos Humanos
 * registrando el permiso de un tercero— y la app del colaborador, que pide el
 * suyo.
 *
 * Durante toda su vida esa exención confió en el cuerpo de la petición: tomaba
 * el `employeeId` que le mandaran y el `exceptionRequestStatus` que le
 * mandaran. Con un token válido cualquiera —el de cualquier colaborador— se
 * podía levantar una solicitud a nombre de otra persona, incluso de otra
 * empresa, y nacerla `accepted`, que es autorizarse el permiso uno mismo. No se
 * notaba porque el único cliente era el backoffice, donde quien llama ya tiene
 * la facultad; abrir la app sin cerrar esto habría publicado el hueco a toda la
 * plantilla.
 *
 * La separación es por facultad: con el permiso de gestión se respeta lo que
 * viene en el cuerpo; sin él, el servidor deriva el empleado del token y fuerza
 * el estatus. Estas pruebas vigilan que esa separación siga en pie, porque es
 * una propiedad del endpoint y no de la pantalla que lo llama.
 */
const CONTROLLER = join(process.cwd(), 'app/controllers/exception_requests_controller.ts')
const VALIDATOR = join(process.cwd(), 'app/validators/exception_request.ts')
const ROUTES = join(process.cwd(), 'start/routes/exception_request_routes.ts')

/** Cuerpo del metodo indicado, acotado al siguiente metodo del controlador. */
function metodo(contenido: string, firma: string): string {
  const inicio = contenido.indexOf(firma)
  if (inicio === -1) return ''

  const resto = contenido.slice(inicio)
  const fin = resto.indexOf('\n  async ', 10)
  const hastaPrivado = resto.indexOf('\n  private async ', 10)
  const corte = [fin, hastaPrivado].filter((posicion) => posicion !== -1).sort((a, b) => a - b)[0]

  return corte === undefined ? resto : resto.slice(0, corte)
}

test.group('ExceptionRequestsController.store — el cuerpo no manda sin facultad', () => {
  test('la facultad de gestionar terceros decide la rama', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    assert.include(
      cuerpo,
      'evaluateSecondaryPermission(',
      'la rama se decide evaluando el permiso, no confiando en el cuerpo'
    )
    assert.include(
      cuerpo,
      'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequest',
      'la facultad evaluada es la de gestionar solicitudes'
    )
  })

  test('sin la facultad, el empleado sale del token y no del cuerpo', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    assert.include(
      cuerpo,
      'resolveSessionEmployee(user)',
      'el empleado de la sesion se deriva del usuario autenticado'
    )
    assert.include(
      cuerpo,
      'empleadoDeLaSesion?.employeeId ?? data.employeeId',
      'el employeeId del cuerpo solo aplica cuando hay facultad sobre terceros'
    )
  })

  test('sin la facultad, el estatus se fuerza a pendiente', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    assert.include(
      cuerpo,
      '? (data.exceptionRequestStatus ?? SELF_SERVICE_INITIAL_STATUS)\n      : SELF_SERVICE_INITIAL_STATUS',
      'quien pide no resuelve: el estatus del cuerpo solo se respeta con facultad'
    )
  })

  test('el alcance de empresa se aplica también a quien gestiona terceros', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    const consultaEmpleado = cuerpo.indexOf('const employee = await Employee.query()')
    const alcance = cuerpo.indexOf('scopedEmployeeIds()')

    assert.isAbove(consultaEmpleado, -1, 'el empleado se consulta antes de crear nada')
    assert.isAbove(alcance, consultaEmpleado, 'la consulta del empleado lleva el corte por empresa')
  })

  test('el colaborador solo pide tipos marcados como solicitables', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    assert.include(
      cuerpo,
      'exceptionType.exceptionTypeCanEmployeeRequests',
      'el catalogo decide que puede pedirse desde la app'
    )
    assert.include(
      cuerpo,
      'exceptionType.exceptionTypeActive !== 1',
      'un tipo dado de baja no se solicita aunque su id se conozca'
    )
  })

  test('el rol que marca lo leido sale de la sesión, no del cuerpo', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    assert.include(
      cuerpo,
      'this.isRhManager(user.roleId)',
      'el rol se lee del usuario autenticado'
    )
    assert.notInclude(
      cuerpo,
      'this.isRhManager(data.role',
      'nadie se asigna a si mismo el rol con el que se marcan los contadores'
    )
  })

  test('solo se avisa al aprobador de lo que queda pendiente de resolver', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async store(')

    const guarda = cuerpo.indexOf("if (exceptionRequestStatus === 'pending') {")
    const aviso = cuerpo.indexOf('notifyBatchCreated(')

    assert.isAbove(guarda, -1, 'debe existir la guarda por estatus')
    assert.isBelow(guarda, aviso, 'un permiso ya autorizado desde el backoffice no pide nada')
  })
})

test.group('storeExceptionRequestValidator — los dias pedidos tienen tope', () => {
  test('daysToApply se valida y no se lee crudo de la petición', ({ assert }) => {
    const validator = readFileSync(VALIDATOR, 'utf-8')
    const controller = readFileSync(CONTROLLER, 'utf-8')

    assert.include(validator, 'daysToApply: vine.number().min(1).max(MAX_DAYS_TO_APPLY)')
    assert.notInclude(
      controller,
      "request.input('daysToApply'",
      'cada dia es un INSERT: sin tope, una sola llamada crea cuantas filas quiera quien la manda'
    )
  })
})

test.group('Rutas de adjuntos — la puerta del colaborador no la cierra el gate', () => {
  test('las rutas de adjuntos no llevan permissionGate', ({ assert }) => {
    const rutas = readFileSync(ROUTES, 'utf-8')
    const lineasDeAdjuntos = rutas
      .split('\n')
      .filter((linea) => linea.includes('attachments') || linea.includes('Attachment'))

    for (const linea of lineasDeAdjuntos) {
      assert.notInclude(
        linea,
        'permissionGate',
        'el gate en la ruta cerraria el acceso del colaborador a su propia solicitud'
      )
    }
  })

  test('el alcance de adjuntos evalúa la facultad dentro del controlador', ({ assert }) => {
    const controller = readFileSync(CONTROLLER, 'utf-8')
    const cuerpo = metodo(controller, '  private async resolveAttachmentScope(')

    assert.include(cuerpo, 'evaluateSecondaryPermission(ctx, managePermission)')
    assert.include(
      cuerpo,
      'empleadoDeLaSesion.employeeId !== exceptionRequest.employeeId',
      'sin facultad solo se llega a la solicitud propia'
    )
    assert.include(
      cuerpo,
      'ownAttachmentsOfUserId: ctx.auth.user?.userId',
      'sin facultad solo se ven los adjuntos que uno mismo subio'
    )
  })
})
