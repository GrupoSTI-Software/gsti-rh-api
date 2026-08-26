import { test } from '@japa/runner'
import { isMaskEcho, maskSensitiveValue } from '#helpers/sensitive_mask'

test.group('isMaskEcho — Anexo A USRH1787433076990', () => {
  test('reconoce las 8 formas legítimas de máscara', ({ assert }) => {
    const legit = [
      maskSensitiveValue('VARL850602AB3', 'identificacion'),
      maskSensitiveValue('VACW850312J95', 'identificacion'),
      maskSensitiveValue('ABCD123456MDFABC01', 'identificacion'),
      maskSensitiveValue('012345678901234567', 'financiero'),
      maskSensitiveValue('5512345678', 'contacto'),
      maskSensitiveValue('juan@empresa.com', 'contacto'),
      maskSensitiveValue('cualquier-diagnostico', 'salud'),
      maskSensitiveValue('abc', 'identificacion'),
    ]
    for (const value of legit) {
      assert.isTrue(isMaskEcho(value), `debe ser eco: ${value}`)
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
