import { test } from '@japa/runner'
import {
  ALLIANCE_CODE_ALPHABET,
  ALLIANCE_CODE_LENGTH,
  generateAllianceCodeText,
} from '#helpers/alliance_code_generator'

/**
 * USRH1788505941894 — texto CSPRNG del código de la alianza.
 */

test.group('alliance_code_generator', () => {
  test('produce 10 caracteres del alfabeto sin I, O, 0 ni 1', ({ assert }) => {
    for (let i = 0; i < 50; i++) {
      const text = generateAllianceCodeText()
      assert.equal(text.length, ALLIANCE_CODE_LENGTH)
      for (const char of text) {
        assert.include(ALLIANCE_CODE_ALPHABET, char)
      }
      assert.notMatch(text, /[IO01]/)
    }
  })
})
