import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1783115930049 — el buzón de quejas debe exponer el POST nuevo
 * (credenciales en body) junto al GET deprecated (credenciales en query
 * string, conservado por compatibilidad con la App Empleado instalada),
 * ambos públicos, y el envío de evidencias debe llevar el limiter de
 * anti-abuso montado después de auth().
 */

const ROUTES_FILE = join(process.cwd(), 'start/routes/complaint_routes.ts')

test.group('complaint_routes — consulta de estatus (GET deprecated + POST nuevo)', () => {
  test('registra GET /status y POST /status apuntando al controller de quejas', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "router.get('/status', '#controllers/complaint_controller.consultStatus')")
    assert.include(
      content,
      "router.post('/status', '#controllers/complaint_controller.consultStatusFromBody')"
    )
  })

  test('ninguna de las dos rutas de /status monta middleware.auth() (endpoint público)', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    const statusBlock = content.slice(
      content.indexOf("router.get('/status'"),
      content.indexOf("router\n      .get('/attachments/:id/download-url'")
    )

    assert.notInclude(statusBlock, 'middleware.auth()')
  })
})

test.group('complaint_routes — envío de evidencias con anti-abuso', () => {
  test('monta el limiter de attachments después de auth() en POST /:folio/attachments', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')
    const attachmentsRouteIdx = content.indexOf(
      "post('/:folio/attachments', '#controllers/complaint_attachment_controller.store')"
    )
    assert.isAbove(attachmentsRouteIdx, -1)

    const nextRouteIdx = content.indexOf(
      "get('/:complaintId/attachments'",
      attachmentsRouteIdx
    )
    const attachmentsBlock = content.slice(attachmentsRouteIdx, nextRouteIdx)

    const authIdx = attachmentsBlock.indexOf('middleware.auth()')
    const limiterIdx = attachmentsBlock.indexOf('complaintAttachmentsRateLimit')
    assert.isAbove(authIdx, -1)
    assert.isAbove(limiterIdx, -1)
    assert.isBelow(authIdx, limiterIdx, 'auth() debe montarse antes del limiter (usa ctx.auth.user)')
  })

  test('el limiter de attachments permite 10 req/min por usuario con fallback a IP', ({ assert }) => {
    const content = readFileSync(ROUTES_FILE, 'utf-8')

    assert.include(content, "limiter.allowRequests(10).every('1 minute')")
    assert.include(content, 'ctx.auth?.user?.userId ?? ctx.request.ip()')
  })
})
