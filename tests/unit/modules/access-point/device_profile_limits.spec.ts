import { test } from '@japa/runner'
import {
  clampBytes,
  clampProfileTexts,
  clampText,
  OPTIONS_RAW_MAX_BYTES,
  PROFILE_TEXT_LIMITS,
} from '#modules/access-point/device-profile/device_profile.limits'

test.group('Anchos del perfil del equipo', () => {
  test('un valor mas largo que su columna se recorta, no revienta el insert', ({ assert }) => {
    const patch = {
      accessPointProfilePushVersion: 'X'.repeat(120),
      accessPointProfileFpVersion: '10.0.1-beta-larguisimo',
      accessPointProfilePlatform: 'ZAM180_TFT',
    }
    clampProfileTexts(patch)

    assert.lengthOf(patch.accessPointProfilePushVersion, PROFILE_TEXT_LIMITS.accessPointProfilePushVersion)
    assert.lengthOf(patch.accessPointProfileFpVersion, PROFILE_TEXT_LIMITS.accessPointProfileFpVersion)
    // Lo que ya cabia no se toca.
    assert.equal(patch.accessPointProfilePlatform, 'ZAM180_TFT')
  })

  test('un campo sin ancho declarado se deja como esta', ({ assert }) => {
    const patch = { accessPointProfileOptionsRaw: 'Y'.repeat(500) }
    clampProfileTexts(patch)
    assert.lengthOf(patch.accessPointProfileOptionsRaw, 500)
  })

  test('un nulo sigue siendo nulo', ({ assert }) => {
    assert.isNull(clampText(null, 10))
  })

  /**
   * TEXT son bytes, no caracteres: con acentos y otros multibyte, medir por
   * longitud dejaria pasar un valor que la columna no acepta.
   */
  test('el crudo de options se mide en bytes y no parte un caracter por la mitad', ({ assert }) => {
    const largo = 'ñ'.repeat(OPTIONS_RAW_MAX_BYTES)
    const recortado = clampBytes(largo, OPTIONS_RAW_MAX_BYTES)

    assert.isAtMost(Buffer.byteLength(recortado, 'utf8'), OPTIONS_RAW_MAX_BYTES)
    assert.notInclude(recortado, '�')
  })

  test('un crudo que ya cabe se devuelve intacto', ({ assert }) => {
    assert.equal(clampBytes('~Platform=ZAM180_TFT', OPTIONS_RAW_MAX_BYTES), '~Platform=ZAM180_TFT')
  })
})
