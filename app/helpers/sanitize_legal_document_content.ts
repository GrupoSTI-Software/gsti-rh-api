import sanitizeHtml from 'sanitize-html'
import type { LegalDocumentContent } from '#models/legal_document'

/**
 * Whitelist de tags que produce el editor de contenido rico (Quill) usado en
 * el backoffice: párrafos, formato de texto, listas, enlaces, encabezados y
 * citas. Nunca `script`/`iframe`, atributos `on*` ni `javascript:` en `href`.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ol',
  'ul',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'span',
]

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    span: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedStyles: {
    span: {
      color: [/^#[0-9a-fA-F]{3,6}$/],
      'background-color': [/^#[0-9a-fA-F]{3,6}$/],
      'font-weight': [/^bold$/],
      'text-align': [/^(left|center|right|justify)$/],
    },
  },
}

/**
 * Sanea el HTML de una sola cadena (un idioma). Cadena vacía o `undefined`
 * se preservan como cadena vacía: la obligatoriedad de contenido se valida
 * en el service, no aquí (capa de saneo, no de negocio).
 */
export function sanitizeLegalDocumentHtml(html: string | undefined | null): string {
  if (!html) {
    return ''
  }
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim()
}

/** Sanea cada idioma de `content` de forma independiente (regla de negocio 8). */
export function sanitizeLegalDocumentContent(
  content: Partial<LegalDocumentContent> | undefined | null
): LegalDocumentContent {
  return {
    es: sanitizeLegalDocumentHtml(content?.es),
    en: sanitizeLegalDocumentHtml(content?.en),
  }
}
