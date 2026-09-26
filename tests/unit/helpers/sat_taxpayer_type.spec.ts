import { test } from '@japa/runner'
import { deriveTaxpayerTypeFromRfc } from '../../../app/helpers/sat_taxpayer_type.js'

test.group('deriveTaxpayerTypeFromRfc', () => {
  test('RFC de persona moral (12 caracteres) → moral', ({ assert }) => {
    assert.equal(deriveTaxpayerTypeFromRfc('ABC010101AB9'), 'moral')
  })

  test('RFC de persona física (13 caracteres) → fisica', ({ assert }) => {
    assert.equal(deriveTaxpayerTypeFromRfc('ABCD010101AB0'), 'fisica')
  })

  test('normaliza mayúsculas y espacios antes de evaluar longitud', ({ assert }) => {
    assert.equal(deriveTaxpayerTypeFromRfc('  abc010101ab9  '), 'moral')
  })

  test('null o longitud inválida → null', ({ assert }) => {
    assert.isNull(deriveTaxpayerTypeFromRfc(null))
    assert.isNull(deriveTaxpayerTypeFromRfc('INVALID'))
  })
})
