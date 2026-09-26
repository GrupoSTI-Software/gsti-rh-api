import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { PHOTO_TOKEN_BYTES } from './photo.constants.js'

/**
 * Token de descarga de la foto (spec ADMS 7.3, decision D1).
 *
 * Es la unica llave de una peticion que llega SIN sesion: el checador no sabe
 * autenticarse. Por eso son 32 bytes de aleatoriedad criptografica y no un
 * identificador incremental -- un `/biophoto/1/`, `/2/`, `/3/` seria una
 * galeria de caras de la plantilla para quien pruebe numeros.
 *
 * En base de datos vive el HASH. Quien lea la tabla no puede reconstruir el
 * enlace, asi que un respaldo o un volcado no es una fuga de fotos.
 */
export function generatePhotoToken(): string {
  return randomBytes(PHOTO_TOKEN_BYTES).toString('base64url')
}

export function hashPhotoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Comparacion en tiempo constante de dos hashes.
 *
 * La busqueda va por indice sobre el hash, asi que el motor ya compara; esto
 * es para cuando haya que confirmar en memoria, donde un `===` filtra por
 * tiempo cuantos caracteres coinciden.
 */
export function photoTokenHashMatches(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Saca el token de la ruta que pidio el equipo.
 *
 * El matcher tolera cualquier prefijo, query y mayusculas -- igual que la sonda
 * del canal -- porque los firmwares no coinciden en como arman la URL: unos
 * mandan `/iclock/doc/biophoto/<token>/<pin>.jpg` y otros pueden recortar o
 * agregar segmentos. El token es el segmento ANTERIOR al archivo, y si solo
 * viene un segmento con extension, ese es el token (forma de reserva 16.2).
 */
export function extractPhotoToken(path: string): string | null {
  const withoutQuery = path.split('?')[0]
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) return null

  const last = segments[segments.length - 1]
  const isFile = last.includes('.')

  if (isFile && segments.length >= 2) {
    const candidate = segments[segments.length - 2]
    if (isTokenShaped(candidate)) return candidate
    // Forma de reserva: el token ES el nombre del archivo.
    const bare = last.slice(0, last.lastIndexOf('.'))
    return isTokenShaped(bare) ? bare : null
  }
  if (isFile) {
    const bare = last.slice(0, last.lastIndexOf('.'))
    return isTokenShaped(bare) ? bare : null
  }
  return isTokenShaped(last) ? last : null
}

/**
 * Forma de un base64url de 32 bytes: 43 caracteres. Se comprueba antes de
 * tocar la base para que probar rutas no cueste una consulta cada vez.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function isTokenShaped(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}
