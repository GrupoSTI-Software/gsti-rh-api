import { randomBytes, randomUUID } from 'node:crypto'
import {
  COMPLAINT_ATTACHMENT_ALLOWED_CLIENT_EXTENSIONS,
  COMPLAINT_ATTACHMENT_BLOCKED_EXTENSIONS,
  COMPLAINT_ATTACHMENT_STORAGE_EXTENSION_BY_MIME,
  type ComplaintAttachmentAllowedMime,
} from '#constants/complaint_attachment'

const BLOCKED_EXTENSION_SET = new Set<string>(COMPLAINT_ATTACHMENT_BLOCKED_EXTENSIONS)
const ALLOWED_CLIENT_EXTENSION_SET = new Set<string>(COMPLAINT_ATTACHMENT_ALLOWED_CLIENT_EXTENSIONS)

/**
 * Extrae todas las extensiones de un nombre de archivo (incluye dobles: `script.py.jpg`).
 */
export function extractFileNameExtensions(clientName?: string, extname?: string): string[] {
  const normalizedExtname = normalizeExtension(extname)
  const baseName = `${clientName ?? ''}`.trim().split(/[/\\]/).pop() ?? ''
  const segments = baseName.includes('.') ? baseName.split('.').slice(1) : []

  const extensions = segments
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0)

  if (normalizedExtname && (extensions.length === 0 || extensions[extensions.length - 1] !== normalizedExtname)) {
    extensions.push(normalizedExtname)
  }

  return extensions
}

/**
 * Valida el nombre/extensiones declaradas por el cliente antes de sanitizar.
 * Rechaza extensiones de código y cualquier extensión fuera del allowlist.
 */
export function isComplaintAttachmentClientFileAllowed(
  clientName?: string,
  extname?: string
): boolean {
  const extensions = extractFileNameExtensions(clientName, extname)

  if (extensions.length === 0) {
    return false
  }

  if (extensions.some((extension) => BLOCKED_EXTENSION_SET.has(extension))) {
    return false
  }

  const finalExtension = extensions[extensions.length - 1]
  return ALLOWED_CLIENT_EXTENSION_SET.has(finalExtension)
}

/**
 * Genera un nombre de almacenamiento no predecible: `{uuid}-{salt}.{ext}`.
 * La extensión proviene del MIME real detectado, no del nombre del cliente.
 */
export function buildComplaintAttachmentStorageFileName(
  mimeType: ComplaintAttachmentAllowedMime
): string {
  const extension = COMPLAINT_ATTACHMENT_STORAGE_EXTENSION_BY_MIME[mimeType]
  const salt = randomBytes(16).toString('hex')
  return `${randomUUID()}-${salt}.${extension}`
}

function normalizeExtension(extname?: string): string | null {
  const normalized = `${extname ?? ''}`.trim().toLowerCase().replace(/^\./, '')
  return normalized.length > 0 ? normalized : null
}
