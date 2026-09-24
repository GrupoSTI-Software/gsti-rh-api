import { test } from '@japa/runner'
import encryption from '@adonisjs/core/services/encryption'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import { toAmount } from '#services/pii_reveal_service'

test.group('toAmount — normalización de importes revelables (USRH1788478865952)', () => {
  test('número finito se devuelve tal cual', ({ assert }) => {
    assert.equal(toAmount(1250.75), 1250.75)
    assert.equal(toAmount(0), 0)
  })

  test('texto decimal se parsea a número', ({ assert }) => {
    assert.equal(toAmount('1250.7500'), 1250.75)
    assert.equal(toAmount('0.0000'), 0)
  })

  test('null, vacío, máscara y cifrado devuelven null', ({ assert }) => {
    assert.isNull(toAmount(null))
    assert.isNull(toAmount(''))
    assert.isNull(toAmount(SENSITIVE_MASK))
    assert.isNull(toAmount(encryption.encrypt('1250.75')))
    assert.isNull(toAmount(Number.NaN))
  })
})
