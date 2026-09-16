/**
 * Foto del colaborador en el checador (spec ADMS 7.2 y 7.3).
 *
 * Los numeros de tamaño salen de la bateria en hardware: el equipo acepto una
 * imagen de 640 x 800 y 133 920 bytes. Las bandas se abren alrededor de eso.
 */

/** Minimo del ORIGINAL. Menos que esto y el recorte saldria borroso. */
export const PHOTO_SOURCE_MIN_WIDTH = 640
export const PHOTO_SOURCE_MIN_HEIGHT = 800

/** Tamaño del derivado que se le manda al equipo. */
export const PHOTO_DERIVATIVE_WIDTH = 640
export const PHOTO_DERIVATIVE_HEIGHT = 800
export const PHOTO_DERIVATIVE_QUALITY = 85

/** Banda de peso del derivado. Fuera de ella algo salio mal en el proceso. */
export const PHOTO_DERIVATIVE_MIN_BYTES = 40 * 1024
export const PHOTO_DERIVATIVE_MAX_BYTES = 250 * 1024

/** Primeros dos bytes de un JPEG. Si no estan, no es lo que se cree que es. */
export const JPEG_MAGIC = Buffer.from([0xff, 0xd8])

/**
 * Umbrales de calidad. Son HIPOTESIS hasta la prueba 16.4 en hardware: se
 * eligieron para rechazar lo evidente (nadie, dos personas, foto oscura) sin
 * castigar fotos normales de credencial.
 */
export const PHOTO_MIN_FACE_AREA_RATIO = 0.1
export const PHOTO_MIN_BRIGHTNESS = 40
export const PHOTO_MAX_BRIGHTNESS = 220

/** Por que se rechazo una foto. Se guarda para poder explicarlo despues. */
export const PHOTO_VERDICT = {
  OK: 'ok',
  /** El original es mas pequeño de lo que el recorte necesita. */
  RESOLUTION: 'resolution',
  /** No se encontro ninguna cara. */
  NO_FACE: 'no_face',
  /** Mas de una cara: no se sabe cual es el colaborador. */
  MANY_FACES: 'many_faces',
  /** La cara ocupa muy poco del cuadro. */
  FACE_TOO_SMALL: 'face_too_small',
  /** Demasiado oscura o demasiado quemada. */
  BRIGHTNESS: 'brightness',
  /** El derivado no pesa lo que deberia: el proceso salio mal. */
  DERIVATIVE_SIZE: 'derivative_size',
  /** No se pudo evaluar (modelos, memoria). NO es un rechazo de la foto. */
  EVALUATION_FAILED: 'evaluation_failed',
} as const

export type PhotoVerdict = (typeof PHOTO_VERDICT)[keyof typeof PHOTO_VERDICT]

/** Cuanto vive una publicacion desde que se crea. */
export const ADMS_PHOTO_PUBLICATION_TTL_HOURS = 24
/**
 * Y cuanto desde que sale hacia el equipo. Mas corto a proposito: una vez que
 * el enlace viaja por la red del cliente, la ventana de uso se cierra pronto.
 */
export const ADMS_PHOTO_DISPATCH_TTL_MINUTES = 30

/** Bytes de aleatoriedad del token. */
export const PHOTO_TOKEN_BYTES = 32

/** Prefijo del derivado en el bucket privado. */
export const PHOTO_DERIVATIVE_PREFIX = 'employee-biometric-derivatives'

export function derivativeKeyFor(employeeId: number, version: number): string {
  return `${PHOTO_DERIVATIVE_PREFIX}/${employeeId}/${version}.jpg`
}

/**
 * Lectura del token fuera de scope: la peticion del equipo no trae sesion ni
 * empresa, y la empresa se resuelve DESDE la fila encontrada.
 */
export const ADMS_PHOTO_TOKEN_UNSCOPED_REASON =
  'canal ADMS: la descarga de foto llega sin sesion; la empresa se resuelve desde la publicacion'
