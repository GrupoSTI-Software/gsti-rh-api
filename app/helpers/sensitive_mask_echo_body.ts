import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_FIELDS } from '#constants/sensitive_fields'
import { isMaskEcho } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

/**
 * Censo USRH1787433076990 Task 0: profundidad 1 — el BO envía objeto plano
 * en todas las pantallas de expediente gobernadas; propertyValues médicos no son catálogo.
 */
const columnCategory = new Map<string, LegalCategory>(
  SENSITIVE_FIELDS.map((field) => [field.column, field.legalCategory])
)

export const SENSITIVE_COLUMN_KEYS: ReadonlySet<string> = new Set(columnCategory.keys())

export function neutralizeSensitiveMaskEchoInBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  if (!SensitiveAccessContext.isActive()) return body

  let changed = false
  const next: Record<string, unknown> = { ...body }

  for (const key of Object.keys(next)) {
    if (!SENSITIVE_COLUMN_KEYS.has(key)) continue
    const value = next[key]
    if (!isMaskEcho(value)) continue

    const category = columnCategory.get(key)!
    if (SensitiveAccessContext.canRead(category)) continue

    delete next[key]
    changed = true
  }

  return changed ? next : body
}
