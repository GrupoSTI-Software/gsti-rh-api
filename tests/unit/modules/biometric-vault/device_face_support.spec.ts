import { test } from '@japa/runner'
import type AccessPointProfile from '#models/access_point_profile'
import { acceptsFacePhoto, faceSupportOf } from '#modules/biometric-vault/photo/device_face_support'

function profileOf(overrides: Partial<AccessPointProfile>): AccessPointProfile {
  return {
    accessPointProfileMultiBioPhotoSupport: null,
    accessPointProfileFaceFunOn: null,
    ...overrides,
  } as AccessPointProfile
}

test.group('Soporte de rostro por foto en el checador', () => {
  test('el V5L y el SenseFace declaran el rostro en la posicion 9', ({ assert }) => {
    const profile = profileOf({ accessPointProfileMultiBioPhotoSupport: '0:0:0:0:0:0:0:0:0:1' })
    assert.equal(faceSupportOf(profile), 'supported')
  })

  test('un equipo con la posicion 9 en cero no recibe la foto', ({ assert }) => {
    const profile = profileOf({
      accessPointProfileMultiBioPhotoSupport: '0:1:0:0:0:0:0:0:0:0',
      accessPointProfileFaceFunOn: 1,
    })
    assert.equal(faceSupportOf(profile), 'unsupported')
    assert.isFalse(acceptsFacePhoto(profile))
  })

  test('sin MultiBioPhotoSupport decide FaceFunOn', ({ assert }) => {
    assert.equal(faceSupportOf(profileOf({ accessPointProfileFaceFunOn: 1 })), 'supported')
    assert.equal(faceSupportOf(profileOf({ accessPointProfileFaceFunOn: 0 })), 'unsupported')
  })

  /** Un equipo recien conectado aun no habla: negarle la foto lo dejaria sin rostro. */
  test('sin perfil o sin datos se deja pasar', ({ assert }) => {
    assert.equal(faceSupportOf(null), 'unknown')
    assert.isTrue(acceptsFacePhoto(null))
    assert.isTrue(acceptsFacePhoto(profileOf({})))
  })
})
