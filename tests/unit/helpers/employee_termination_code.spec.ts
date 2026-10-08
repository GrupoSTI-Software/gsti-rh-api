import { test } from '@japa/runner'
import {
  EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN,
  stripTerminationCodeSuffix,
} from '#helpers/employee_termination_code'

/**
 * VLRH-H1790812613829 (CA-14) — el código original se recupera quitando SOLO
 * la marca final de la baja; nunca otra parte del código.
 */
test.group('stripTerminationCodeSuffix', () => {
  test('quita la marca final -IN<epoch> y deja el resto intacto', ({ assert }) => {
    assert.equal(stripTerminationCodeSuffix('A-120-IN1790000000'), 'A-120')
    assert.equal(stripTerminationCodeSuffix('MX-INV-7-IN1790000000'), 'MX-INV-7')
  })

  test('un código sin marca, o con -IN interno, no se toca (split("-IN") recortaría MX)', ({
    assert,
  }) => {
    assert.equal(stripTerminationCodeSuffix('MX-INV-7'), 'MX-INV-7')
    assert.equal(stripTerminationCodeSuffix('A-INX'), 'A-INX')
  })

  test('con un doble sufijo heredado quita solo el último (declarado)', ({ assert }) => {
    assert.equal(stripTerminationCodeSuffix('A-IN1-IN2'), 'A-IN1')
  })

  test('acepta el código numérico del modelo y devuelve texto', ({ assert }) => {
    assert.strictEqual(stripTerminationCodeSuffix(1234), '1234')
  })

  test('el patrón exige dígitos al final: no es una búsqueda libre de -IN', ({ assert }) => {
    assert.isTrue(EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN.test('X-IN7'))
    assert.isFalse(EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN.test('X-IN'))
    assert.isFalse(EMPLOYEE_TERMINATION_CODE_SUFFIX_PATTERN.test('X-IN7-Y'))
  })
})
