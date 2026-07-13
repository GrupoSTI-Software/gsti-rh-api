import sanitizeHtml from 'sanitize-html'
import type { TeleworkPolicyComponent } from '#models/telework_policy_template'

/**
 * Whitelist de tags que produce el editor de contenido rico (Quill) del BO.
 * Espejo exacto de `sanitize_legal_document_content.ts` para mantener el
 * saneado consistente entre módulos de contenido enriquecido del repo.
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

/** Sanea el HTML del cuerpo de un solo componente. Vacío/`undefined` se preserva como cadena vacía. */
export function sanitizeTeleworkPolicyHtml(html: string | undefined | null): string {
  if (!html) {
    return ''
  }
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim()
}

/**
 * Sanea el `body` de cada componente de la política/plantilla, preservando
 * `key`/`clause`/`title`/`required`/`order` sin modificar.
 */
export function sanitizeTeleworkPolicyComponents(
  components: TeleworkPolicyComponent[]
): TeleworkPolicyComponent[] {
  return components.map((component) => ({
    ...component,
    body: sanitizeTeleworkPolicyHtml(component.body),
  }))
}
