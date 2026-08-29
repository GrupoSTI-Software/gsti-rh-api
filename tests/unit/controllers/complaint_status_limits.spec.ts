import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Los umbrales de la consulta de estatus del buzón viven como constantes en el
 * controller. Este test los ancla porque la decisión no es obvia: el candado de
 * folio es el que frena la fuerza bruta y no debe aflojarse; el de IP existe
 * solo como techo anti-escaneo y se mantiene generoso a propósito, porque en un
 * centro de trabajo con NAT todos los teléfonos salen con la misma IP pública y
 * un umbral bajo bloquea a quien no falló.
 */
const CONTROLLER_FILE = join(process.cwd(), 'app/controllers/complaint_controller.ts')

test.group('complaint_controller — umbrales de la consulta de estatus', () => {
  test('el candado por folio se mantiene en 5 fallos / 15 min', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(
      content,
      "const CONSULT_STATUS_FOLIO_LIMIT = { requests: 5, duration: '15 minutes' } as const"
    )
  })

  test('el candado por IP tolera NAT: 40 fallos / 5 min', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(
      content,
      "const CONSULT_STATUS_IP_LIMIT = { requests: 40, duration: '5 minutes' } as const"
    )
  })
})
