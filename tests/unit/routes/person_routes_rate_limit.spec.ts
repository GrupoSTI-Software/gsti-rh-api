import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1789762889970 — el piso anti-automatización de la escritura de expedientes
 * (`person-write`, 40/min por usuario con respaldo por IP) y el guard del sondeo
 * de correo personal montados SOLO en las rutas de escritura de `/api/persons`,
 * más la rama del handler que traduce el `E_TOO_MANY_REQUESTS` del limiter al
 * 429 del catálogo.
 *
 * Aserciones por CONTENIDO DE ARCHIVO (molde `complaint_status_routes.spec.ts`):
 * no bootean la app. El montaje real por HTTP lo ejercitan las pruebas
 * funcionales (Tasks 8 y 9). El censo de la cadena `.use()` del grupo vive en
 * `sensitive_access_context_mounts.spec.ts` y no se duplica aquí.
 */

const ROOT = process.cwd()
const ROUTES_FILE = join(ROOT, 'start/routes/person_routes.ts')
const THROTTLE_FILE = join(ROOT, 'app/helpers/person_email_probe_throttle.ts')
const HANDLER_FILE = join(ROOT, 'app/exceptions/handler.ts')

const PERSON_WRITE_MOUNT = '.use([personWriteRateLimit, personEmailProbeGuard])'

/**
 * Bloque de una ruta: desde la referencia a su controller hasta la referencia de
 * la ruta siguiente. Robusto al reformateo de prettier — no depende de que
 * `router.post(...)` viva en una sola línea.
 */
function routeBlock(content: string, from: string, to: string): string {
  const start = content.indexOf(from)
  if (start === -1) return ''
  const end = content.indexOf(to, start + from.length)
  return content.slice(start, end === -1 ? content.length : end)
}

test.group('person_routes — piso de escritura y guard del sondeo', () => {
  test('monta [personWriteRateLimit, personEmailProbeGuard] en POST / y PUT /:personId', ({
    assert,
  }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    const store = routeBlock(
      content,
      '#controllers/person_controller.store',
      '#controllers/person_controller.update'
    )
    const update = routeBlock(
      content,
      '#controllers/person_controller.update',
      '#controllers/person_controller.delete'
    )

    assert.include(store, PERSON_WRITE_MOUNT, 'POST /api/persons monta el piso y el guard')
    assert.include(update, PERSON_WRITE_MOUNT, 'PUT /api/persons/:personId monta el piso y el guard')
  })

  test('NO monta el piso ni el guard en GET /, DELETE /:personId ni GET /:personId', ({
    assert,
  }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    const blocks: Array<[string, string]> = [
      [
        'GET /',
        routeBlock(
          content,
          '#controllers/person_controller.index',
          '#controllers/person_controller.store'
        ),
      ],
      [
        'DELETE /:personId',
        routeBlock(
          content,
          '#controllers/person_controller.delete',
          '#controllers/person_controller.show'
        ),
      ],
      [
        'GET /:personId',
        routeBlock(
          content,
          '#controllers/person_controller.show',
          '#controllers/person_controller.getEmployee'
        ),
      ],
    ]

    for (const [name, block] of blocks) {
      assert.isNotEmpty(block, `${name}: no se pudo aislar el bloque de la ruta`)
      assert.notInclude(block, 'personWriteRateLimit', `${name} no monta el piso de escritura`)
      assert.notInclude(block, 'personEmailProbeGuard', `${name} no monta el guard del sondeo`)
    }
  })

  test('monta exactamente dos veces: las dos rutas de escritura, ni una más', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    const mounts = content.split(PERSON_WRITE_MOUNT).length - 1

    assert.equal(mounts, 2)
  })
})

test.group('person_routes — valores del limiter person-write', () => {
  test("permite 40 cada '1 minute', por usuario con respaldo por IP", ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "limiter.define('person-write'")
    assert.include(content, "limiter.allowRequests(40).every('1 minute')")
    assert.include(content, 'person-write:user:${ctx.auth.user?.userId ?? ctx.request.ip()}')
  })

  test("NEGATIVA: 'penalize' no aparece en person_routes.ts ni en el throttle (CA-2)", ({
    assert,
  }) => {
    assert.notInclude(
      readFileSync(ROUTES_FILE, 'utf-8'),
      'penalize',
      'la cuota se consume en TODO intento, jamás con penalize'
    )
    assert.notInclude(
      readFileSync(THROTTLE_FILE, 'utf-8'),
      'penalize',
      'la cuota se consume en TODO intento, jamás con penalize'
    )
  })
})

test.group('person_routes — el parche es aditivo', () => {
  test('el grupo de /api/persons conserva businessScope() y sensitiveAccess()', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    const start = content.indexOf(".prefix('/api/persons')")
    const end = content.indexOf(".prefix('/api/person-get-employee')")
    const chain = content.slice(start, end)

    assert.isAbove(start, -1)
    assert.include(chain, '.use(middleware.auth())')
    assert.include(chain, '.use(middleware.businessScope())')
    assert.include(chain, '.use(middleware.sensitiveAccess())')
    assert.include(chain, '.use(middleware.sensitiveMaskEcho())')
  })
})

test.group('handler — la rama del 429 del piso de escritura', () => {
  test('traduce el E_TOO_MANY_REQUESTS de /api/persons con respondPersonWriteRateLimit', ({
    assert,
  }) => {
    const handler = readFileSync(HANDLER_FILE, 'utf-8')

    assert.include(handler, "from '../helpers/person_email_request_errors.js'")
    assert.include(
      handler,
      'isPersonWriteRateLimitError(error) && isPersonWritePath(ctx.request.url())'
    )
    assert.include(handler, 'respondPersonWriteRateLimit(ctx, error)')
  })

  test('la rama va junto a las demás y antes del fallback a super.handle', ({ assert }) => {
    const handler = readFileSync(HANDLER_FILE, 'utf-8')

    const newBranch = handler.indexOf('isPersonWriteRateLimitError(error)')
    const previousBranch = handler.indexOf('isAdditionalBusinessUnitRateLimitError(error)')
    const fallback = handler.indexOf('return super.handle(error, ctx)')

    assert.isAbove(previousBranch, -1, 'la rama de business-units ya existía')
    assert.isAbove(newBranch, previousBranch, 'la rama nueva va DESPUÉS de las existentes')
    assert.isAbove(fallback, newBranch, 'la rama nueva va ANTES del fallback')
  })
})
