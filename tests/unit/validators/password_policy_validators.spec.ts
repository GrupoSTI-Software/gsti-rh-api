import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import { invitationSetPasswordValidator } from '#validators/auth_invitation'
import { completeSignupValidator } from '#validators/signup'
import { isValidPassword } from '#helpers/password_policy'

/**
 * Alta e invitación validaban 12 caracteres sin exigir minúscula, mientras el
 * restablecimiento pedía 8 con ambas cajas. Con dos políticas conviviendo, el
 * restablecimiento era la puerta para dejar cualquier cuenta más débil de lo
 * que su alta habría permitido.
 *
 * Estas pruebas fijan que los dos validadores de VineJS apliquen exactamente la
 * misma política que el helper, que es la que usa el restablecimiento.
 */

/** `true` si el validador aceptó la contraseña. */
async function acceptedByInvitation(password: string): Promise<boolean> {
  try {
    await invitationSetPasswordValidator.validate({
      token: 'token-de-prueba',
      userPassword: password,
      userPasswordConfirm: password,
    })
    return true
  } catch (error) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) return false
    throw error
  }
}

/** `true` si el validador de alta aceptó la contraseña. */
async function acceptedBySignup(password: string): Promise<boolean> {
  try {
    await completeSignupValidator.validate({
      signupDraftId: 1,
      signupToken: 'token-de-prueba',
      password,
      passwordConfirm: password,
    })
    return true
  } catch (error) {
    if (error instanceof vineErrors.E_VALIDATION_ERROR) return false
    throw error
  }
}

const CASOS = [
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
  'Valanserh2026!',
  'Abcdefg1~',
]

test.group('validadores de contraseña — política única', () => {
  test('la invitación aplica la misma política que el helper', async ({ assert }) => {
    for (const caso of CASOS) {
      assert.equal(
        await acceptedByInvitation(caso),
        isValidPassword(caso),
        `discrepancia en "${caso}"`
      )
    }
  })

  test('el alta aplica la misma política que el helper', async ({ assert }) => {
    for (const caso of CASOS) {
      assert.equal(await acceptedBySignup(caso), isValidPassword(caso), `discrepancia en "${caso}"`)
    }
  })

  test('ocho caracteres con las cuatro clases ya son suficientes', async ({ assert }) => {
    // Antes se exigían 12: este caso concreto era rechazado.
    assert.isTrue(await acceptedByInvitation('Abcdefg1!'))
    assert.isTrue(await acceptedBySignup('Abcdefg1!'))
  })

  test('sin minúscula ya no pasa', async ({ assert }) => {
    // Antes pasaba: la política vieja no la exigía.
    assert.isFalse(await acceptedByInvitation('ABCDEFGH123!'))
    assert.isFalse(await acceptedBySignup('ABCDEFGH123!'))
  })
})
