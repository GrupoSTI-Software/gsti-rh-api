/**
 * Lectura del formato de biometricos del conector viejo.
 *
 * La columna guarda una lista en texto --"Finger:1, Finger:2, Face"-- que
 * escribio el conector de BioTime. Vive aqui, y no dentro del servicio que la
 * usaba, porque la boveda del canal ADMS tambien tiene que leerla para saber
 * que dedos ya existian antes de que el checador empezara a subirlos, y ese
 * camino no tiene por que arrastrar el i18n del servicio.
 */
export interface ParsedBiometricData {
  fingers: number[]
  face: boolean
}

const FINGER_PREFIX = 'Finger:'
const FACE_TOKEN = 'Face'
/** Numeracion de dedos del equipo: cualquier otra cosa no es un dedo. */
const FINGER_ID_MIN = 0
const FINGER_ID_MAX = 9

/** Saca los dedos y el rostro de la lista en texto; lo que no encaje se ignora. */
export function parseBiometricData(data: string): ParsedBiometricData {
  const fingers: number[] = []
  let face = false

  if (!data || data.trim() === '') return { fingers, face }

  for (const part of data.split(',').map((item) => item.trim())) {
    if (part.startsWith(FINGER_PREFIX)) {
      const fingerId = Number.parseInt(part.replace(FINGER_PREFIX, ''), 10)
      if (!Number.isNaN(fingerId) && fingerId >= FINGER_ID_MIN && fingerId <= FINGER_ID_MAX) {
        fingers.push(fingerId)
      }
    } else if (part === FACE_TOKEN) {
      face = true
    }
  }

  return { fingers, face }
}
