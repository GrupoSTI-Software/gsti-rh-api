import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { HttpRequestMarker } from '#utils/http_request_marker'
import HttpRequestMarkerMiddleware from '#middleware/http_request_marker_middleware'

test.group('HttpRequestMarker (USRH1789600808831)', () => {
  test('fuera de run es false', ({ assert }) => {
    assert.isFalse(HttpRequestMarker.isInHttpRequest())
  })

  test('dentro de run es true tras await anidado', async ({ assert }) => {
    await HttpRequestMarker.run(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.isTrue(HttpRequestMarker.isInHttpRequest())
    })
    assert.isFalse(HttpRequestMarker.isInHttpRequest())
  })

  test('el middleware marca la cadena de next', async ({ assert }) => {
    const middleware = new HttpRequestMarkerMiddleware()
    let seen = false
    const result = await middleware.handle({} as never, async () => {
      seen = HttpRequestMarker.isInHttpRequest()
      return 'ok'
    })
    assert.isTrue(seen)
    assert.equal(result, 'ok')
    assert.isFalse(HttpRequestMarker.isInHttpRequest())
  })

  test('start/kernel.ts registra el middleware como primera entrada de server.use', async ({
    assert,
  }) => {
    const source = await readFile(app.makePath('start/kernel.ts'), 'utf8')
    const serverBlock = source.slice(source.indexOf('server.use(['), source.indexOf('router.use(['))
    const firstEntry = serverBlock.match(/import\('([^']+)'\)/)?.[1]
    assert.equal(firstEntry, '#middleware/http_request_marker_middleware')
    const rest = source.slice(source.indexOf('router.use(['))
    assert.notInclude(rest, 'http_request_marker_middleware')
  })
})
