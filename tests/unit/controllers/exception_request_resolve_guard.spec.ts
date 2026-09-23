import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * `updateStatus` nunca validaba el estatus actual de la solicitud: aceptaba
 * cualquier `accepted`/`refused` y guardaba. No se notaba porque el backoffice
 * solo abria el detalle de las pendientes, asi que no habia por donde pedir la
 * resolucion de una ya cerrada.
 *
 * Desde que "Ver detalle" se muestra en cualquier estatus, esa puerta existe, y
 * reincidir dispararia de nuevo la notificacion al empleado y los efectos del
 * alta en vacaciones. La guarda tiene que estar en el endpoint y no solo en la
 * vista, porque la vista no es el unico cliente.
 *
 * La resolucion en si vive en `ExceptionRequestResolutionService`, que es lo que
 * comparten la resolucion individual y la de lote; aqui se prueba que el
 * controlador no lo invoque sin antes verificar el estatus.
 */
const CONTROLLER = join(process.cwd(), 'app/controllers/exception_requests_controller.ts')

/** Cuerpo del metodo indicado, acotado al siguiente metodo del controlador. */
function metodo(contenido: string, firma: string): string {
  const inicio = contenido.indexOf(firma)
  if (inicio === -1) return ''

  const resto = contenido.slice(inicio)
  const fin = resto.indexOf('\n  async ', 10)

  return fin === -1 ? resto : resto.slice(0, fin)
}

test.group('ExceptionRequestsController.updateStatus — solo resuelve pendientes', () => {
  test('rechaza con 409 una solicitud que ya no esta pendiente', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async updateStatus(')

    assert.include(
      cuerpo,
      "if (exceptionRequest.exceptionRequestStatus !== 'pending') {",
      'debe existir la guarda por estatus actual'
    )
    assert.include(cuerpo, 'response.status(409)', 'la reincidencia responde 409')
  })

  test('la guarda corre ANTES de invocar la resolucion', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async updateStatus(')

    const guarda = cuerpo.indexOf("if (exceptionRequest.exceptionRequestStatus !== 'pending') {")
    const resolucion = cuerpo.indexOf('ExceptionRequestResolutionService().resolve(')

    assert.isAbove(guarda, -1, 'la guarda debe existir')
    assert.isAbove(resolucion, -1, 'la resolucion debe delegarse al servicio')
    assert.isBelow(
      guarda,
      resolucion,
      'una guarda posterior a la resolucion no evitaria el reenvio de la notificacion'
    )
  })
})

test.group('ExceptionRequestsController.resolveBatch — valida el lote completo antes de escribir', () => {
  test('verifica alcance y estatus de todos los ids antes de resolver ninguno', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async resolveBatch(')

    const alcance = cuerpo.indexOf('exceptionRequests.length !== ids.length')
    const yaResueltas = cuerpo.indexOf('alreadyResolved.length > 0')
    const resolucion = cuerpo.indexOf('resolutionService.resolve(')

    assert.isAbove(alcance, -1, 'el lote compara cuantas solicitudes alcanza a ver')
    assert.isAbove(yaResueltas, -1, 'el lote detecta las que ya estaban resueltas')
    assert.isAbove(resolucion, -1, 'el lote delega en el mismo servicio que la individual')
    assert.isBelow(alcance, resolucion, 'el corte por alcance va antes de escribir')
    assert.isBelow(yaResueltas, resolucion, 'el corte por estatus va antes de escribir')
  })

  test('el rechazo en lote exige nota antes de tocar la base', ({ assert }) => {
    const cuerpo = metodo(readFileSync(CONTROLLER, 'utf-8'), '  async resolveBatch(')

    const nota = cuerpo.indexOf("status === 'refused' && resolutionNote.length === 0")
    const consulta = cuerpo.indexOf('ExceptionRequest.query()')

    assert.isAbove(nota, -1, 'el rechazo sin nota se corta explicitamente')
    assert.isBelow(nota, consulta, 'la validacion de la nota va antes de consultar el lote')
  })
})
