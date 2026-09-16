/**
 * Anchos de las columnas de texto del perfil del equipo.
 *
 * Todo lo que hay aqui llega del aparato y nadie lo valida antes: un firmware
 * distinto puede mandar un `~PushVersion` de sesenta caracteres donde caben
 * cincuenta. Con MySQL en modo estricto ese INSERT no trunca, falla, y el
 * perfil de ese equipo se queda sin actualizar para siempre mientras cada
 * subida de `options` levanta un incidente.
 *
 * Vale mas un dato recortado que un equipo sin perfil. Los numeros salen de la
 * migracion 1788912000005 (perfil) y de la 1769633415047 (descriptor); si una
 * cambia alla, cambia aqui.
 */

/** VARCHAR cuenta caracteres, no bytes. */
export const PROFILE_TEXT_LIMITS = {
  accessPointProfilePlatform: 50,
  accessPointProfileFwVersion: 100,
  accessPointProfilePushVersion: 50,
  accessPointProfileOemVendor: 100,
  accessPointProfileRegistryCode: 20,
  accessPointProfileFpVersion: 10,
  accessPointProfileFaceVersion: 10,
  accessPointProfileFvVersion: 10,
  accessPointProfilePvVersion: 10,
  accessPointProfileMultiBioDataSupport: 50,
  accessPointProfileMultiBioPhotoSupport: 50,
  accessPointProfileMultiBioVersion: 100,
  accessPointProfileMaxMultiBioDataCount: 100,
  accessPointProfileMaxMultiBioPhotoCount: 100,
  accessPointProfileVideoProtocol: 10,
  accessPointProfileLastIpSeen: 45,
} as const

/** Ancho del descriptor, que vive en `access_points`. */
export const DESCRIPTOR_TEXT_LIMITS = {
  deviceName: 200,
  ip: 45,
  mac: 50,
  firmware: 100,
  platform: 100,
} as const

/**
 * `TEXT` son 65535 BYTES, no caracteres. Se recorta por bytes y se deja margen
 * para no partir un caracter multibyte por la mitad.
 */
export const OPTIONS_RAW_MAX_BYTES = 65_000

export function clampText(value: string | null, maxLength: number): string | null {
  if (value === null) return null
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

export function clampBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  return Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8')
}

/**
 * Recorta en sitio los campos de texto del patch segun el catalogo.
 *
 * Recorre el catalogo y no el patch: una clave nueva sin ancho declarado no se
 * toca, y una que se declare aqui queda cubierta sin tocar el servicio.
 */
export function clampProfileTexts<T extends object>(patch: T): T {
  const target = patch as unknown as Record<string, unknown>
  for (const [field, maxLength] of Object.entries(PROFILE_TEXT_LIMITS)) {
    const value = target[field]
    if (typeof value === 'string') target[field] = clampText(value, maxLength)
  }
  return patch
}
