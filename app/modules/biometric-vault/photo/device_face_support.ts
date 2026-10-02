import type AccessPointProfile from '#models/access_point_profile'

export const DEVICE_FACE_SUPPORT = {
  SUPPORTED: 'supported',
  UNSUPPORTED: 'unsupported',
  /** El equipo aun no declara sus opciones: no hay con que negarlo. */
  UNKNOWN: 'unknown',
} as const

export type DeviceFaceSupport = (typeof DEVICE_FACE_SUPPORT)[keyof typeof DEVICE_FACE_SUPPORT]

/** Posicion del rostro de luz visible en `MultiBioPhotoSupport` (tabla `Type=9`). */
const VISIBLE_FACE_INDEX = 9

/**
 * Si el checador puede recibir el rostro por foto, segun lo que el propio
 * aparato declara en `options`.
 *
 * `MultiBioPhotoSupport` es la palabra mas precisa: una posicion por modalidad,
 * y la 9 es el rostro. El V5L y el SenseFace 2A declaran `...:1` ahi. Sin ese
 * campo se cae a `FaceFunOn`. Si el equipo todavia no manda nada se responde
 * `unknown` y se deja pasar: negarle la foto a un equipo recien conectado por no
 * haber hablado aun lo dejaria sin rostro sin motivo, y si no lo soporta el
 * comando falla y se ve en la ficha.
 */
export function faceSupportOf(profile: AccessPointProfile | null): DeviceFaceSupport {
  if (!profile) return DEVICE_FACE_SUPPORT.UNKNOWN

  const multi = profile.accessPointProfileMultiBioPhotoSupport
  if (multi && multi.includes(':')) {
    return multi.split(':')[VISIBLE_FACE_INDEX] === '1'
      ? DEVICE_FACE_SUPPORT.SUPPORTED
      : DEVICE_FACE_SUPPORT.UNSUPPORTED
  }

  const faceFunOn = profile.accessPointProfileFaceFunOn
  if (faceFunOn === 1) return DEVICE_FACE_SUPPORT.SUPPORTED
  if (faceFunOn === 0) return DEVICE_FACE_SUPPORT.UNSUPPORTED
  return DEVICE_FACE_SUPPORT.UNKNOWN
}

/** Verdadero salvo que el aparato haya dicho que no. */
export function acceptsFacePhoto(profile: AccessPointProfile | null): boolean {
  return faceSupportOf(profile) !== DEVICE_FACE_SUPPORT.UNSUPPORTED
}
