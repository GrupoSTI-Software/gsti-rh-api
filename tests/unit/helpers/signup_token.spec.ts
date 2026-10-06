import { test } from '@japa/runner'
import { signupTokenMatches } from '../../../app/helpers/signup_token.js'

/** USRH1790718243123 — CA-6 */
test.group('signup_token', () => {
  test('signupTokenMatches en tiempo constante', ({ assert }) => {
    const t = '3f2b9c1e-7d4a-4e8b-9a61-5c0d2e7f8a90'
    assert.isTrue(signupTokenMatches(t, t))
    assert.isFalse(signupTokenMatches(t, `${t.slice(0, -1)}1`))
    assert.isFalse(signupTokenMatches(t, t.slice(0, -1)))
    assert.isFalse(signupTokenMatches(null, t))
    assert.isFalse(signupTokenMatches(t, 'x'.repeat(10_000)))
    assert.isFalse(signupTokenMatches(t, t.toUpperCase()))
  })

})
