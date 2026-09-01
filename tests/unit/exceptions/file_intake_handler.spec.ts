import { test } from '@japa/runner'
import HttpExceptionHandler from '../../../app/exceptions/handler.js'
import { FileIntakeError } from '../../../app/exceptions/file_intake_error.js'
import { FILE_INTAKE_ERROR_CODES } from '../../../app/constants/file_intake_error_codes.js'

/**
 * El rechazo de un archivo tiene que llegar al cliente como 422 con el triplete
 * del estandar. La prueba se hace sobre la RESPUESTA, no sobre el objeto de
 * excepcion: el hueco que esta suite cubre fue exactamente ese — el error se
 * construia bien pero nadie lo traducia, asi que el cliente recibia un 500.
 */

/** Doble del `response` de Adonis: registra status y cuerpo. */
function fakeResponse() {
  const registro: { status?: number; body?: unknown } = {}
  const response = {
    status(code: number) {
      registro.status = code
      return response
    },
    json(payload: unknown) {
      registro.body = payload
      return payload
    },
  }
  return { response, registro }
}

function contextoConResponse(response: unknown) {
  return { response } as unknown as Parameters<HttpExceptionHandler['handle']>[1]
}

test.group('HttpExceptionHandler — rechazo de archivos', () => {
  test('un FileIntakeError sale como 422 con titulo, detalle, key y codigo', async ({ assert }) => {
    const { response, registro } = fakeResponse()
    const error = new FileIntakeError({
      title: 'Archivo no aceptado',
      detail: 'El contenido del archivo no corresponde a PDF.',
      key: 'contenido-no-corresponde',
      errorCode: FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
    })

    await new HttpExceptionHandler().handle(error, contextoConResponse(response))

    assert.equal(registro.status, 422, 'debe responder 422, no 500')
    assert.deepEqual(registro.body, {
      type: 'error',
      title: 'Archivo no aceptado',
      detail: 'El contenido del archivo no corresponde a PDF.',
      key: 'contenido-no-corresponde',
      code: FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
    })
  })

  test('respeta el status propio del error cuando no es 422', async ({ assert }) => {
    const { response, registro } = fakeResponse()
    const error = new FileIntakeError({
      title: 'Archivo no aceptado',
      detail: 'No fue posible leer el archivo recibido.',
      key: 'archivo-ilegible',
      errorCode: FILE_INTAKE_ERROR_CODES.SANITIZATION_FAILED,
      status: 400,
    })

    await new HttpExceptionHandler().handle(error, contextoConResponse(response))

    assert.equal(registro.status, 400)
  })

  test('la respuesta no filtra la pila ni rutas del servidor', async ({ assert }) => {
    const { response, registro } = fakeResponse()
    const error = new FileIntakeError({
      title: 'Archivo no aceptado',
      detail: 'El archivo esta danado o su contenido no pudo procesarse.',
      key: 'archivo-no-procesable',
      errorCode: FILE_INTAKE_ERROR_CODES.SANITIZATION_FAILED,
    })

    await new HttpExceptionHandler().handle(error, contextoConResponse(response))

    const serializado = JSON.stringify(registro.body)
    assert.notInclude(serializado, 'stack')
    assert.notInclude(serializado, '/Users/')
    assert.notInclude(serializado, 'node_modules')
  })

  test('la propiedad de status se llama `status`, que es la que lee Adonis', ({ assert }) => {
    const error = new FileIntakeError({
      title: 't',
      detail: 'd',
      key: 'k',
      errorCode: FILE_INTAKE_ERROR_CODES.FILE_MISSING,
    })

    // Regresion: con `httpStatus` el framework caia a 500 si el error escapaba
    // de la rama del handler.
    assert.equal(error.status, 422)
    assert.notProperty(error, 'httpStatus')
  })
})
