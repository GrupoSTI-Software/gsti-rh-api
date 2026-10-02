/**
 * Reglas fijas de la Matriz de vencimientos agregada
 * (`GET /api/documents-expiration-matrix`).
 */

/**
 * Ventana única de la matriz, en días naturales de la zona de negocio. Entra
 * todo lo vencido (sin límite inferior) y lo que vence de hoy a hoy + 30,
 * ambos inclusive.
 */
export const EXPIRATION_MATRIX_WINDOW_DAYS = 30

/** Fuentes de vencimientos que agrega la matriz, en el orden en que se consultan. */
export const EXPIRATION_MATRIX_SOURCES = [
  'employee-file',
  'employee-contract',
  'company-file',
  'certification',
  'repse-folio',
  'provider-folio',
  'supply',
] as const

export type ExpirationMatrixSource = (typeof EXPIRATION_MATRIX_SOURCES)[number]

/**
 * Llave de un vencimiento: `<fuente>-<id>`. Las fuentes llevan guiones, así
 * que el id es el último segmento numérico.
 */
export const EXPIRATION_MATRIX_KEY_PATTERN =
  /^(employee-file|employee-contract|company-file|certification|repse-folio|provider-folio|supply)-([1-9]\d{0,9})$/

/** Arma la llave única y estable de un vencimiento. */
export function buildExpirationMatrixKey(source: ExpirationMatrixSource, id: number): string {
  return `${source}-${id}`
}

/** Fuente e id de una llave; `null` si la llave no tiene el formato de la matriz. */
export function parseExpirationMatrixKey(
  key: string
): { source: ExpirationMatrixSource; id: number } | null {
  const match = EXPIRATION_MATRIX_KEY_PATTERN.exec(key)
  if (!match) return null

  const source = EXPIRATION_MATRIX_SOURCES.find((candidate) => candidate === match[1])
  const id = Number(match[2])
  if (!source || !Number.isSafeInteger(id)) return null

  return { source, id }
}

/**
 * Primer segmento del nombre del archivo descargado, por fuente. Nunca lleva
 * datos del empleado (regla de `#helpers/download_file_name`).
 */
export const EXPIRATION_MATRIX_FILE_NAME_PREFIX: Readonly<Record<ExpirationMatrixSource, string>> = {
  'employee-file': 'expediente',
  'employee-contract': 'contrato',
  'company-file': 'expediente-empresa',
  'certification': 'certificacion',
  'repse-folio': 'constancia-repse',
  'provider-folio': 'folio-proveedor-repse',
  'supply': 'resguardo-insumo',
}

/** Keys semánticas de error del módulo (contrato título/detalle/key). */
export const EXPIRATION_MATRIX_ERROR_KEYS = {
  ITEM_NOT_FOUND: 'vencimiento-no-encontrado',
  FILE_NOT_FOUND: 'archivo-no-encontrado',
  DOWNLOAD_FORBIDDEN: 'sin-permiso-de-descarga',
  INVALID_INPUT: 'entrada-invalida',
  UNEXPECTED: 'error-inesperado',
} as const

export type ExpirationMatrixErrorKey =
  (typeof EXPIRATION_MATRIX_ERROR_KEYS)[keyof typeof EXPIRATION_MATRIX_ERROR_KEYS]
