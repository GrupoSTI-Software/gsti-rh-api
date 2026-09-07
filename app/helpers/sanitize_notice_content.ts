import sanitizeHtml from 'sanitize-html'

/**
 * Etiquetas que produce el editor del backoffice para el mensaje de un aviso:
 * negrita, cursiva, subrayado, enlaces y listas. Nada de `script`, `iframe`,
 * atributos `on*` ni `javascript:` en `href`: el mensaje se pinta como HTML en
 * el backoffice, en la app y en el correo.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ol', 'ul', 'li', 'a']

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Todo enlace abre en pestaña nueva sin ceder el `opener`.
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
}

/**
 * Sanea el HTML del mensaje de un aviso. Cadena vacía o ausente se preserva
 * como cadena vacía: la obligatoriedad se valida en el servicio.
 */
export function sanitizeNoticeHtml(html: string | undefined | null): string {
  if (!html) {
    return ''
  }
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim()
}

/**
 * Longitud del mensaje tal como lo cuenta el usuario: sin etiquetas, con las
 * entidades resueltas y los espacios de los extremos fuera. Es la misma medida
 * que muestra el contador del backoffice, para que ambos lados coincidan.
 */
export function noticePlainTextLength(html: string | undefined | null): number {
  if (!html) {
    return 0
  }
  const plain = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  return plain
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim().length
}
