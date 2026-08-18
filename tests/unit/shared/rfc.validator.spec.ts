import { test } from '@japa/runner'
import {
  computeRfcCheckDigit,
  isSatGenericRfc,
  isValidRfcSat,
  SAT_GENERIC_RFCS,
} from '../../../app/shared/validators/rfc.validator.js'

test.group('RFC SAT validator', () => {
  test('acepta RFC genéricos oficiales del SAT sin validar dígito verificador', ({
    assert,
  }) => {
    for (const rfc of SAT_GENERIC_RFCS) {
      assert.isTrue(isSatGenericRfc(rfc))
      assert.isTrue(isValidRfcSat(rfc))
    }
  })

  test('XAXX010101000 no cumple el algoritmo estándar de dígito verificador', ({
    assert,
  }) => {
    const base = 'XAXX01010100'
    assert.notEqual(computeRfcCheckDigit(base), '0')
  })

  test('rechaza RFC con formato inválido', ({ assert }) => {
    assert.isFalse(isValidRfcSat('INVALID'))
  })
})
