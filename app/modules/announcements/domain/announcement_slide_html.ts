import sanitizeHtml from 'sanitize-html'

/**
 * Allowlist del cuerpo de un slide. Más corta que la de documentos legales
 * (`app/helpers/sanitize_legal_document_content.ts`): un slide es un párrafo o una
 * lista corta, sin encabezados, citas ni estilos en línea. Misma librería y mismos
 * candados de enlace (esquemas http/https/mailto, sin `//host`).
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // El BO pinta el HTML dentro de su propia pestaña: todo enlace abre en otra y sin
  // `opener`. Lo que traiga el origen en `rel`/`target` se reemplaza.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
}

/**
 * Sanea el HTML del cuerpo de un slide antes de guardarlo. Quita `<script>` con su
 * contenido, atributos `on*`, estilos y todo tag fuera de la allowlist (conserva su
 * texto). Es capa de saneo, no de negocio: la obligatoriedad la decide el validator.
 */
export function sanitizeAnnouncementSlideHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim()
}
