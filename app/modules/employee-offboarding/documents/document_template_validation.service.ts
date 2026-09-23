import { sanitizeVerdictDetail } from '#helpers/pdf_template_safety'
import type { DocumentTemplateValidationResult } from '../document-templates/document_template_validation_result.type.js'
import type { EmployeeOffboardingDocumentType } from './documents.constants.js'
import { fieldsForDocumentType } from './document_fields.constants.js'

/**
 * Contraste de los campos rellenables de una plantilla contra el catálogo de
 * campos combinables (USRH1789097550388). Funciones PURAS: no consultan, no
 * traducen, no lanzan y no leen el reloj. Quien decide el estado de la
 * versión y lanza el 422 es `DocumentTemplatesService`; quien pinta el
 * dictamen es el BO.
 *
 * Vive en `documents/` junto al catálogo que lee, como el resto de sus
 * consumidoras. El esquema del dictamen lo declara
 * `document_template_validation_result.type.ts`; aquí se fija qué significa
 * cada lista y quién la puebla.
 */

/** Tope absoluto de la distancia de edición para sugerir un campo (regla 4). */
export const SUGGESTION_MAX_DISTANCE = 3

/**
 * Umbral por candidato: a lo sumo un tercio de su largo y nunca más de
 * `SUGGESTION_MAX_DISTANCE`. `folio` (5) admite una edición; `hire_date` (9)
 * y `employee_name` (13) admiten tres. Corto a propósito: una sugerencia
 * forzada manda a renombrar el campo equivocado (regla 4).
 */
function suggestionThreshold(candidate: string): number {
  return Math.min(SUGGESTION_MAX_DISTANCE, Math.floor(Array.from(candidate).length / 3))
}

/**
 * Distancia de Levenshtein por puntos de código con matriz de dos filas:
 * O(n·m) en tiempo y O(m) en memoria, sobre nombres de ≤ 120 caracteres
 * contra ≤ 10 candidatos. A mano: el repo no tiene helper de distancia y una
 * dependencia por veinte líneas no paga (KISS/YAGNI).
 */
export function levenshteinDistance(a: string, b: string): number {
  const source = Array.from(a)
  const target = Array.from(b)
  if (source.length === 0) return target.length
  if (target.length === 0) return source.length

  let previous = Array.from({ length: target.length + 1 }, (_, index) => index)
  let current = new Array<number>(target.length + 1).fill(0)
  for (let i = 1; i <= source.length; i++) {
    current[0] = i
    for (let j = 1; j <= target.length; j++) {
      const substitution = previous[j - 1] + (source[i - 1] === target[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[target.length]
}

/**
 * Candidato del catálogo al que más se parece `fieldName`, o `null` cuando el
 * parecido no es real (regla 4): la distancia mínima debe ser ÚNICA y caber
 * en el umbral del candidato; un empate también devuelve `null`. Se compara
 * el nombre tal como está escrito, no su significado: `nombre_empleado` queda
 * a 11 ediciones del más cercano y sale sin sugerencia.
 */
export function suggestFieldKey(fieldName: string, candidates: readonly string[]): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let tied = false
  for (const candidate of candidates) {
    const distance = levenshteinDistance(fieldName, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
      tied = false
    } else if (distance === bestDistance) {
      tied = true
    }
  }
  if (best === null || tied || bestDistance > suggestionThreshold(best)) {
    return null
  }
  return best
}

/**
 * Contraste (reglas 1, 5, 7 y 8). Cada nombre se sanea y trunca igual que en
 * la revisión estructural (regla 3: se cita tal como venía, nunca se
 * reescribe), los repetidos se colapsan (regla 8) y el resto se reparte en
 * tres listas de orden estable (regla 7): `recognized` y `missingRequired` en
 * orden del catálogo, `unrecognized` en orden de aparición en el archivo.
 * `passed` ⇔ ninguna de las dos listas de hallazgos tiene elementos (regla
 * 5). `checkedAt` lo pone quien llama: la función es determinista.
 */
export function validateTemplateFields(
  formFieldNames: readonly string[],
  documentType: EmployeeOffboardingDocumentType,
  checkedAt: string
): DocumentTemplateValidationResult {
  const catalog = fieldsForDocumentType(documentType)
  const catalogKeys = catalog.map((field) => field.key)
  const known = new Set(catalogKeys)
  const names = new Set(formFieldNames.map((name) => sanitizeVerdictDetail(name)))

  const recognized = catalogKeys.filter((key) => names.has(key))
  const missingRequired = catalog
    .filter((field) => field.requiredInTemplate && !names.has(field.key))
    .map((field) => field.key)
  const unrecognized = [...names]
    .filter((name) => !known.has(name))
    .map((fieldName) => ({ fieldName, suggestedFieldKey: suggestFieldKey(fieldName, catalogKeys) }))

  return {
    checkedAt,
    documentType,
    passed: unrecognized.length === 0 && missingRequired.length === 0,
    recognized,
    unrecognized,
    missingRequired,
  }
}
