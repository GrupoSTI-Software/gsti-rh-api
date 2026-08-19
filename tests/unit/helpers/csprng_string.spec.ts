import { test } from '@japa/runner'
import { randomStringFromAlphabet } from '../../../app/helpers/csprng_string.js'

/**
 * USRH1783115930049 — CSPRNG compartido usado por el buzón de quejas
 * (folio/passphrase) y por `demo_password.ts`. Cubre formato (largo,
 * alfabeto), no-determinismo y los guardas de entrada inválida.
 */
test.group('csprng_string — randomStringFromAlphabet', () => {
  test('respeta el largo pedido', ({ assert }) => {
    const value = randomStringFromAlphabet('ABC123', 12)
    assert.equal(value.length, 12)
  })

  test('solo usa caracteres del alfabeto dado', ({ assert }) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const value = randomStringFromAlphabet(alphabet, 200)
    for (const char of value) {
      assert.include(alphabet, char)
    }
  })

  test('dos llamadas seguidas no producen el mismo valor (no determinista)', ({ assert }) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const a = randomStringFromAlphabet(alphabet, 20)
    const b = randomStringFromAlphabet(alphabet, 20)
    assert.notEqual(a, b)
  })

  test('con un alfabeto de un solo carácter, siempre devuelve ese carácter repetido', ({ assert }) => {
    const value = randomStringFromAlphabet('X', 5)
    assert.equal(value, 'XXXXX')
  })

  test('rechaza alfabeto vacío', ({ assert }) => {
    assert.throws(() => randomStringFromAlphabet('', 10))
  })

  test('rechaza longitud cero o negativa', ({ assert }) => {
    assert.throws(() => randomStringFromAlphabet('ABC', 0))
    assert.throws(() => randomStringFromAlphabet('ABC', -1))
  })

  test('formato del folio del buzón (100000-999999, primer dígito nunca 0) se mantiene sobre 500 muestras', ({
    assert,
  }) => {
    for (let i = 0; i < 500; i++) {
      const suffix =
        randomStringFromAlphabet('123456789', 1) + randomStringFromAlphabet('0123456789', 5)
      assert.equal(suffix.length, 6)
      const asNumber = Number(suffix)
      assert.isAtLeast(asNumber, 100000)
      assert.isAtMost(asNumber, 999999)
    }
  })

  test('formato de la passphrase del buzón (12 chars, alfabeto sin ambiguos) se mantiene', ({ assert }) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const passphrase = randomStringFromAlphabet(alphabet, 12)
    assert.equal(passphrase.length, 12)
    for (const char of passphrase) {
      assert.include(alphabet, char)
    }
  })
})
