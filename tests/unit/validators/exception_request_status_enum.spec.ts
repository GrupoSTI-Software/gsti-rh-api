import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import {
  storeExceptionRequestValidator,
  updateExceptionRequestValidator,
} from '#validators/exception_request'

/**
 * El enum de `exception_request_status` cargaba dos nombres para el mismo
 * estado: `requested` (default de la columna) y `pending` (lo que el front
 * manda siempre). Nada transicionaba de uno al otro, el endpoint de resolucion
 * solo acepta `accepted`/`refused` y la UI solo reconoce `pending`, asi que
 * toda solicitud nacida con el default quedaba invisible e inoperable.
 *
 * El estado no resuelto es UNO y se llama `pending`. Estas pruebas fijan que
 * `requested` ya no sea un valor aceptable por la API.
 */

/** `true` si el validador acepto el payload. */
async function accepted(validate: () => Promise<unknown>): Promise<boolean> {
  try {
    await validate()
    return true
  } catch (error) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) return false
    throw error
  }
}

const basePayload = {
  employeeId: 1,
  exceptionTypeId: 1,
  requestedDate: '2026-09-17',
}

test.group('Solicitudes de excepcion — enum de estatus', () => {
  test('el alta rechaza "requested": el estado no resuelto es "pending"', async ({ assert }) => {
    const acepto = await accepted(() =>
      storeExceptionRequestValidator.validate({
        ...basePayload,
        exceptionRequestStatus: 'requested',
      })
    )

    assert.isFalse(acepto, '"requested" ya no es un estatus valido')
  })

  test('el alta acepta los tres estatus vigentes', async ({ assert }) => {
    for (const estatus of ['pending', 'accepted', 'refused']) {
      const acepto = await accepted(() =>
        storeExceptionRequestValidator.validate({
          ...basePayload,
          exceptionRequestStatus: estatus,
        })
      )

      assert.isTrue(acepto, `"${estatus}" debe seguir siendo valido`)
    }
  })

  test('la actualizacion rechaza "requested"', async ({ assert }) => {
    const acepto = await accepted(() =>
      updateExceptionRequestValidator.validate({
        requestedDate: '2026-09-17',
        exceptionRequestStatus: 'requested',
      })
    )

    assert.isFalse(acepto, '"requested" ya no es un estatus valido')
  })
})
