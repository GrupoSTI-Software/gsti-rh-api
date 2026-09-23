import { test } from '@japa/runner'
import {
  isMaskEcho,
  maskSensitiveValue,
  SENSITIVE_MASK,
} from '#helpers/sensitive_mask'

test.group('maskSensitiveValue — USRH1789328027039', () => {
  test('devuelve máscara fija para cualquier valor capturado', ({ assert }) => {
    const values = [
      'VARL850602AB3',
      'VACW850312J95',
      'ABCD123456MDFABC01',
      '012345678901234567',
      '5512345678',
      'juan@empresa.com',
      'cualquier-diagnostico',
      'abc',
    ]
    for (const value of values) {
      assert.equal(maskSensitiveValue(value), SENSITIVE_MASK)
    }
  })

  test('null, undefined y blanco llegan vacíos', ({ assert }) => {
    assert.isNull(maskSensitiveValue(null))
    assert.isNull(maskSensitiveValue(undefined))
    assert.equal(maskSensitiveValue(''), '')
    assert.equal(maskSensitiveValue('   '), '   ')
  })
})

test.group('isMaskEcho — Anexo A USRH1787433076990', () => {
  test('reconoce la máscara fija producida por maskSensitiveValue', ({ assert }) => {
    assert.isTrue(isMaskEcho(SENSITIVE_MASK))
    assert.isTrue(isMaskEcho(maskSensitiveValue('VARL850602AB3')))
  })

  test('reconoce las formas heredadas literales', ({ assert }) => {
    const legacy = [
      '•••••••••2AB3',
      'j•••@empresa.com',
      '••••••4321',
    ]
    for (const value of legacy) {
      assert.isTrue(isMaskEcho(value), `debe ser eco heredado: ${value}`)
    }
  })

  test('rechaza los 2 controles negativos', ({ assert }) => {
    assert.isFalse(isMaskEcho('•••X1234ABCD'))
    assert.isFalse(isMaskEcho('VARL•50602AB3'))
  })

  test('no confunde null ni número', ({ assert }) => {
    assert.isFalse(isMaskEcho(null))
    assert.isFalse(isMaskEcho(undefined))
    assert.isFalse(isMaskEcho(12345))
  })
})
