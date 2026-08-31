import { randomBytes, randomUUID } from 'node:crypto'
import {
  FILE_INTAKE_BLOCKED_EXTENSIONS,
  FILE_INTAKE_STORAGE_EXTENSION_BY_MIME,
  type FileIntakeMime,
  type FileIntakeProfile,
} from '#constants/file_intake'

const BLOCKED_EXTENSION_SET: ReadonlySet<string> = new Set(FILE_INTAKE_BLOCKED_EXTENSIONS)

/**
 * Extrae TODAS las extensiones de un nombre de archivo, no solo la ultima.
 * `factura.php.jpg` devuelve `['php', 'jpg']`, que es lo que permite cazar la
 * doble extension. Descarta cualquier componente de ruta que venga en el nombre.
 */
export function extractFileNameExtensions(clientName?: string, extname?: string): string[] {
  const normalizedExtname = normalizeExtension(extname)
  const baseName = `${clientName ?? ''}`.trim().split(/[/\\]/).pop() ?? ''
  const segments = baseName.includes('.') ? baseName.split('.').slice(1) : []

  const extensions = segments
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0)

  if (
    normalizedExtname &&
    (extensions.length === 0 || extensions[extensions.length - 1] !== normalizedExtname)
  ) {
    extensions.push(normalizedExtname)
  }

  return extensions
}

/** Motivo por el que el nombre declarado por el cliente no pasa. */
export type ClientFileNameRejection = 'extension-blocked' | 'extension-not-allowed'

/**
 * Valida el nombre declarado por el cliente contra la blocklist global y contra
 * las extensiones del perfil. Es el primer filtro, antes de leer un solo byte:
 * barato y suficiente para descartar lo obvio.
 *
 * Devuelve `null` cuando el nombre es aceptable.
 */
export function rejectClientFileName(
  profile: FileIntakeProfile,
  clientName?: string,
  extname?: string
): ClientFileNameRejection | null {
  const extensions = extractFileNameExtensions(clientName, extname)

  if (extensions.length === 0) {
    return 'extension-not-allowed'
  }

  if (extensions.some((extension) => BLOCKED_EXTENSION_SET.has(extension))) {
    return 'extension-blocked'
  }

  const finalExtension = extensions[extensions.length - 1]
  return profile.allowedClientExtensions.includes(finalExtension)
    ? null
    : 'extension-not-allowed'
}

/**
 * Nombre de almacenamiento no predecible: `{uuid}-{salt}.{ext}`.
 * La extension sale del MIME REAL de salida; el nombre del cliente nunca llega
 * al bucket, asi que no puede arrastrar rutas, acentos ni una extension mentida.
 */
export function buildStorageFileName(mimeType: FileIntakeMime): string {
  const extension = FILE_INTAKE_STORAGE_EXTENSION_BY_MIME[mimeType]
  const salt = randomBytes(16).toString('hex')
  return `${randomUUID()}-${salt}.${extension}`
}

function normalizeExtension(extname?: string): string | null {
  const normalized = `${extname ?? ''}`.trim().toLowerCase().replace(/^\./, '')
  return normalized.length > 0 ? normalized : null
}
