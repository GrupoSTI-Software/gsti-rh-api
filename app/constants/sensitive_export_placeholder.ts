/**
 * Marcador de celda sensible en exports sin permiso `export-sensitive-data`.
 * Indica que el dato existe pero no se reveló; la importación debe ignorarlo.
 */
export const SENSITIVE_EXPORT_PLACEHOLDER = '*****'

/**
 * Indica si el valor de una celda es vacío o el marcador de export enmascarado.
 */
export function isSensitiveExportPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  return String(value).trim() === '' || String(value).trim() === SENSITIVE_EXPORT_PLACEHOLDER
}
