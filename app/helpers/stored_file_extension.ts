import { FILE_INTAKE_STORAGE_EXTENSION_BY_MIME } from '#constants/file_intake'

/**
 * Extensión real de un archivo ya almacenado (subido por un usuario), para
 * que el nombre de descarga armado con `buildDownloadFileName` nunca salga
 * sin extensión.
 *
 * Orden de confianza: la key de almacenamiento (la pone el API al aceptar el
 * archivo), luego el nombre original y al final el MIME. Si nada resuelve se
 * usa `bin`: el archivo se descarga igual, sin inventar un formato.
 */

const FALLBACK_EXTENSION = 'bin'

/** Una extensión razonable: 1 a 5 caracteres alfanuméricos. */
const EXTENSION_PATTERN = /^[a-z0-9]{1,5}$/

const EXTENSION_BY_MIME: Readonly<Record<string, string | undefined>> =
  FILE_INTAKE_STORAGE_EXTENSION_BY_MIME

export interface StoredFileExtensionSources {
  /** Key o ruta en el almacenamiento. */
  storedPath?: string | null
  /** Nombre original del archivo, si se guardó. */
  fileName?: string | null
  /** MIME del objeto o del registro. */
  contentType?: string | null
}

function extensionFromPath(path: string | null | undefined): string | null {
  if (!path) return null
  const lastSegment = path.split(/[/\\]/).pop() ?? ''
  const lastDot = lastSegment.lastIndexOf('.')
  if (lastDot <= 0) return null
  const extension = lastSegment.slice(lastDot + 1).toLowerCase()
  return EXTENSION_PATTERN.test(extension) ? extension : null
}

function extensionFromMime(contentType: string | null | undefined): string | null {
  if (!contentType) return null
  const mime = contentType.split(';')[0].trim().toLowerCase()
  return EXTENSION_BY_MIME[mime] ?? null
}

/** Extensión sin punto (`pdf`, `jpg`…) del archivo almacenado. */
export function resolveStoredFileExtension(sources: StoredFileExtensionSources): string {
  return (
    extensionFromPath(sources.storedPath) ??
    extensionFromPath(sources.fileName) ??
    extensionFromMime(sources.contentType) ??
    FALLBACK_EXTENSION
  )
}
