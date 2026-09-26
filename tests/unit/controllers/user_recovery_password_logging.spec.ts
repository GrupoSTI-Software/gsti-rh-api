import { test } from '@japa/runner'
import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import UserController from '../../../app/controllers/user_controller.js'

/**
 * `recoveryPassword` responde siempre 200 con un mensaje genérico para no
 * revelar qué correos están registrados. Esa opacidad es deliberada de cara al
 * cliente, pero durante un incidente dejó ciego al equipo: un envío que nunca
 * salió se veía igual que uno exitoso. Estas pruebas fijan el contrato: la
 * respuesta sigue siendo genérica Y el fallo queda registrado en el log.
 */

interface CapturedResponse {
  status?: number
}

function makeResponse(): { response: HttpContext['response']; captured: CapturedResponse } {
  const captured: CapturedResponse = {}
  const response = {
    status(code: number) {
      captured.status = code
      return response
    },
  } as unknown as HttpContext['response']
  return { response, captured }
}

/** Request que revienta al leer el cuerpo: fuerza la entrada al `catch`. */
function makeFailingRequest(): HttpContext['request'] {
  return {
    input(key: string, defaultValue?: unknown) {
      if (key === 'language') return defaultValue ?? 'es'
      if (key === 'userEmail') return 'alguien@ejemplo.com'
      return defaultValue
    },
    all() {
      throw new Error('fallo simulado al leer la solicitud')
    },
    header() {
      return undefined
    },
  } as unknown as HttpContext['request']
}

/** Sustituye `logger.error` por un espía y devuelve la función de restauración. */
function spyOnLoggerError(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = []
  const original = logger.error.bind(logger)
  // El tipado de pino declara varias sobrecargas; el espía solo acumula.
  ;(logger as unknown as { error: (...args: unknown[]) => void }).error = (...args: unknown[]) => {
    calls.push(args)
  }
  return {
    calls,
    restore: () => {
      ;(logger as unknown as { error: unknown }).error = original
    },
  }
}

test.group('UserController.recoveryPassword — registro de fallos', () => {
  test('registra el error cuando la solicitud falla', async ({ assert }) => {
    const spy = spyOnLoggerError()
    try {
      const { response, captured } = makeResponse()
      const ctx = { request: makeFailingRequest(), response } as unknown as HttpContext

      const controller = new UserController()
      const body = await controller.recoveryPassword(ctx)

      // La respuesta al cliente no cambia: genérica y 200.
      assert.equal(captured.status, 200)
      assert.equal(body.type, 'success')

      // Y el fallo quedó registrado con un prefijo rastreable.
      assert.isAbove(spy.calls.length, 0, 'se esperaba al menos una llamada a logger.error')
      const message = spy.calls[0].find((arg) => typeof arg === 'string')
      assert.include(String(message), 'auth:recovery')
    } finally {
      spy.restore()
    }
  })
})
