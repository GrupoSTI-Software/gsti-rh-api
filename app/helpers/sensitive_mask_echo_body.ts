import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_FIELDS } from '#constants/sensitive_fields'
import { isMaskEcho } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

/**
 * Censo USRH1787433076990 Task 0: profundidad 1 — el BO envía objeto plano
 * en todas las pantallas de expediente gobernadas. Única excepción anidada:
 * `propertyValues[]` de la condición médica, cuyo valor entró al catálogo como
 * dato de salud; ahí el eco se vuelve `null` ("conservar") en vez de borrarse,
 * porque el service upserta por propiedad y necesita el id de la propiedad.
 */
const columnCategory = new Map<string, LegalCategory>(
  SENSITIVE_FIELDS.map((field) => [field.column, field.legalCategory])
)

export const SENSITIVE_COLUMN_KEYS: ReadonlySet<string> = new Set(columnCategory.keys())

const PROPERTY_VALUES_KEY = 'propertyValues'
const PROPERTY_VALUE_COLUMN = 'medicalConditionTypePropertyValue'

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

    delete next[key]
    changed = true
  }

  const propertyValues = next[PROPERTY_VALUES_KEY]
  if (Array.isArray(propertyValues)) {
    let nestedChanged = false
    const neutralized = propertyValues.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item
      const entry = item as Record<string, unknown>
      if (!isMaskEcho(entry[PROPERTY_VALUE_COLUMN])) return item
      nestedChanged = true
      return { ...entry, [PROPERTY_VALUE_COLUMN]: null }
    })
    if (nestedChanged) {
      next[PROPERTY_VALUES_KEY] = neutralized
      changed = true
    }
  }

  return changed ? next : body
}
