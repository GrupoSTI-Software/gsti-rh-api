import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { MASK_CHAR, maskSensitiveValue } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const catalog = new SensitiveFieldsCatalogService()

/**
 * Fábrica de `serialize` para columnas clasificadas (USRH1787204602825).
 *
 * Resuelve la categoría una vez al evaluar el decorador (carga del módulo).
 * Si el par no está en el catálogo, tapa siempre con máscara total: nunca
 * en claro por omisión.
 */
export function sensitiveSerialize(
  model: string,
  column: string
): (value: string | null) => string | null {
  const category = catalog.categoryOf(model, column)

  return (value: string | null): string | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return MASK_CHAR.repeat(5)
    }

    if (SensitiveAccessContext.canRead(category)) {
      return value
    }

    return maskSensitiveValue(value, category)
  }
}

/**
 * Fábrica de `serialize` para importes clasificados (USRH1787204602828).
 * Sin permiso devuelve `null`: `maskLastFour` sobre un importe filtra magnitud.
 */
export function sensitiveSerializeNumeric(
  model: string,
  column: string
): (value: number | null) => number | null {
  const category = catalog.categoryOf(model, column)

  return (value: number | null): number | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return null
    }

    if (SensitiveAccessContext.canRead(category)) {
      return value
    }

    return null
  }
}

/**
 * Enmascara un valor leído de la propiedad del modelo (DTO que no pasa por Lucid `serialize`).
 * Cadena vacía se deja igual: no hay dato que tapar.
 */
export function maskSensitiveDtoValue(
  model: string,
  column: string,
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value === '') {
    return ''
  }

  const category = catalog.categoryOf(model, column)
  if (category === null) {
    return MASK_CHAR.repeat(5)
  }
  if (SensitiveAccessContext.canRead(category)) {
    return value
  }
  return maskSensitiveValue(value, category)
}
