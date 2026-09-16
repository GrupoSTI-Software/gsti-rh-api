import { test } from '@japa/runner'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { readRawBody } from '#modules/adms/channel/adms_raw_body'

function fakeRequest(chunks: string[]): IncomingMessage {
  return Readable.from(
    chunks.map((chunk) => Buffer.from(chunk, 'utf8'))
  ) as unknown as IncomingMessage
}

test.group('ADMS raw body', () => {
  test('junta los trozos y cuenta los bytes', async ({ assert }) => {
    const result = await readRawBody(fakeRequest(['9999\t2026-08-12 ', '08:53:23\t0\t1\n']), 1024)
    assert.isTrue(result.ok)
    if (result.ok) {
      assert.equal(result.body, '9999\t2026-08-12 08:53:23\t0\t1\n')
      assert.equal(result.bytes, 29)
    }
  })

  test('corta al superar el tope sin acumular el resto', async ({ assert }) => {
    const result = await readRawBody(fakeRequest(['a'.repeat(600), 'b'.repeat(600)]), 1000)
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.reason, 'too_large')
      assert.isAtLeast(result.bytes, 1001)
    }
  })

  test('cuerpo vacio es valido con cero bytes', async ({ assert }) => {
    const result = await readRawBody(fakeRequest([]), 1000)
    assert.isTrue(result.ok)
    if (result.ok) assert.equal(result.bytes, 0)
  })
})
