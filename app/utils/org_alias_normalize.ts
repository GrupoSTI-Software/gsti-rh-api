import OrgAliasAppError from '#exceptions/org_alias_app_error'

/** Longitud máxima del campo completo (lista separada por comas). */
export const ORG_ALIASES_MAX_FIELD_LENGTH = 2000

/** Longitud máxima de cada alias individual tras trim. */
export const ORG_ALIAS_MAX_SEGMENT_LENGTH = 120

/** Caracteres permitidos por segmento: letras (Unicode), números, espacios y guion. */
const SEGMENT_PATTERN = /^[\p{L}\p{N}\s\-]+$/u

/**
 * Normaliza texto para búsqueda y unicidad: trim, minúsculas y sin marcas diacríticas.
 */
export function normalizeForSearch(input: string): string {
  return input
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * Escapa %, _ y \ para usar el término dentro de LIKE con bindings.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export type PreparedOrgAliases = {
  /** Valor a persistir (segmentos separados por ", " preservando escritura del usuario en cada uno). */
  display: string | null
  /** Tokens normalizados únicos para unicidad. */
  normalizedTokens: string[]
}

/**
 * Parsea el string de alias del request, valida y deduplica por forma normalizada.
 */
export function prepareAliasesForPersistence(raw: string | null | undefined): PreparedOrgAliases {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { display: null, normalizedTokens: [] }
  }

  const str = String(raw)
  if (str.length > ORG_ALIASES_MAX_FIELD_LENGTH) {
    throw new OrgAliasAppError(
      'alias-invalido',
      'Alias inválido',
      `La lista de alias no puede superar ${ORG_ALIASES_MAX_FIELD_LENGTH} caracteres.`
    )
  }

  const parts = str.split(',')
  const seenNormalized = new Set<string>()
  const displaySegments: string[] = []
  const normalizedTokens: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed === '') continue

    if (trimmed.length > ORG_ALIAS_MAX_SEGMENT_LENGTH) {
      throw new OrgAliasAppError(
        'alias-invalido',
        'Alias inválido',
        `Cada alias puede tener como máximo ${ORG_ALIAS_MAX_SEGMENT_LENGTH} caracteres.`
      )
    }

    if (!SEGMENT_PATTERN.test(trimmed)) {
      throw new OrgAliasAppError(
        'alias-invalido',
        'Alias inválido',
        'Uno o más alias contienen caracteres no permitidos o exceden la longitud máxima.'
      )
    }

    const normalized = normalizeForSearch(trimmed)
    if (normalized === '') {
      throw new OrgAliasAppError(
        'alias-invalido',
        'Alias inválido',
        'Uno o más alias contienen caracteres no permitidos o exceden la longitud máxima.'
      )
    }

    if (seenNormalized.has(normalized)) continue
    seenNormalized.add(normalized)
    displaySegments.push(trimmed)
    normalizedTokens.push(normalized)
  }

  if (displaySegments.length === 0) {
    return { display: null, normalizedTokens: [] }
  }

  return {
    display: displaySegments.join(', '),
    normalizedTokens,
  }
}
