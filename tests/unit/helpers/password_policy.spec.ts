import { test } from '@japa/runner'
import {
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MIN_LENGTH,
  evaluatePasswordPolicy,
  isValidPassword,
} from '#helpers/password_policy'

/**
 * La política vive en tres lugares por necesidad —backoffice, app y aquí—, y
 * las tres tienen que decir lo mismo: una contraseña aceptada en un cliente
 * sirve para entrar por el otro. Estas pruebas fijan la referencia del servidor,
 * que es la única que no se puede saltar.
 */
test.group('password policy', () => {
  test('rechaza lo que no es texto', ({ assert }) => {
    assert.isFalse(isValidPassword(undefined))
    assert.isFalse(isValidPassword(null))
    assert.isFalse(isValidPassword(12345678))
    assert.isFalse(isValidPassword(['Abcdefg1!']))
  })

  test('rechaza una contraseña de menos de ocho caracteres', ({ assert }) => {
    assert.isFalse(isValidPassword('Ab1!efg'))
    assert.isFalse(isValidPassword('123456'))
  })

  test('exige mayúscula y minúscula juntas', ({ assert }) => {
    assert.isFalse(isValidPassword('abcdefg1!'))
    assert.isFalse(isValidPassword('ABCDEFG1!'))
    assert.isTrue(isValidPassword('Abcdefg1!'))
  })

  test('exige número y símbolo', ({ assert }) => {
    assert.isFalse(isValidPassword('Abcdefgh!'))
    assert.isFalse(isValidPassword('Abcdefg12'))
  })

  test('informa qué regla falla', ({ assert }) => {
    const result = evaluatePasswordPolicy('abcdefgh')

    assert.isTrue(result.minLength)
    assert.isFalse(result.bothCases)
    assert.isFalse(result.number)
    assert.isFalse(result.symbol)
  })

  test('acepta el set de símbolos del producto', ({ assert }) => {
    const symbols = '!@#$%^&*()_+[]{}|;:,.<>?'.split('')
    for (const symbol of symbols) {
      assert.isTrue(
        isValidPassword(`Abcdefg1${symbol}`),
        `el símbolo "${symbol}" debería aceptarse`
      )
    }
    // Fuera del set: la tilde y el espacio no cuentan como símbolo.
    assert.isFalse(isValidPassword('Abcdefg1~'))
    assert.isFalse(isValidPassword('Abcdefg1 '))
  })

  test('el patrón de VineJS coincide con la función en todos los casos', ({ assert }) => {
    // Los validadores de registro e invitación usan el patrón; el reset usa la
    // función. Si dejaran de decir lo mismo, una misma contraseña se aceptaría
    // en un endpoint y se rechazaría en otro.
    const casos = [
      '',
      '123456',
      'abcdefgh',
      'ABCDEFGH',
      'Abcdefgh',
      'Abcdefg1',
      'Abcdefg!',
      'abcdefg1!',
      'ABCDEFG1!',
      'Abcdefg1!',
      'Ab1!efg',
      'Contrasena.Larga.2026!',
      'Abcdefg1~',
    ]

    for (const caso of casos) {
      const porFuncion = isValidPassword(caso)
      const porPatron = caso.length >= PASSWORD_MIN_LENGTH && PASSWORD_COMPLEXITY_PATTERN.test(caso)
      assert.equal(porPatron, porFuncion, `discrepancia en "${caso}"`)
    }
  })
})
