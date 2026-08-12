import { test } from '@japa/runner'
import { randomStringFromAlphabet, secureRandomInt } from '../../../app/helpers/csprng_string.js'

test.group('csprng_string', () => {
  test('randomStringFromAlphabet respeta el largo pedido', ({ assert }) => {
    const value = randomStringFromAlphabet('ABCDEFGH', 14)
    assert.equal(value.length, 14)
  })

  test('randomStringFromAlphabet solo usa caracteres del alfabeto', ({ assert }) => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const value = randomStringFromAlphabet(alphabet, 500)
    for (const char of value) {
      assert.include(alphabet, char)
    }
  })

  test('randomStringFromAlphabet produce valores distintos en llamadas sucesivas', ({ assert }) => {
    const values = new Set<string>()
    for (let i = 0; i < 50; i++) {
      values.add(randomStringFromAlphabet('0123456789', 10))
    }
    assert.isAbove(values.size, 1)
  })

  test('randomStringFromAlphabet rechaza alfabeto vacío', ({ assert }) => {
    assert.throws(() => randomStringFromAlphabet('', 5))
  })

  test('randomStringFromAlphabet rechaza largo <= 0', ({ assert }) => {
    assert.throws(() => randomStringFromAlphabet('AB', 0))
    assert.throws(() => randomStringFromAlphabet('AB', -1))
  })

  test('secureRandomInt siempre cae en el rango [min, max)', ({ assert }) => {
    for (let i = 0; i < 1000; i++) {
      const value = secureRandomInt(100000, 1000000)
      assert.isAtLeast(value, 100000)
      assert.isBelow(value, 1000000)
      assert.isTrue(Number.isInteger(value))
    }
  })

  test('secureRandomInt produce valores distintos en llamadas sucesivas', ({ assert }) => {
    const values = new Set<number>()
    for (let i = 0; i < 50; i++) {
      values.add(secureRandomInt(100000, 1000000))
    }
    assert.isAbove(values.size, 1)
  })
})
