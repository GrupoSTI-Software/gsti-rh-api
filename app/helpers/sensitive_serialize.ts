import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { SENSITIVE_MASK, maskSensitiveValue } from '#helpers/sensitive_mask'

const catalog = new SensitiveFieldsCatalogService()

/**
 * Fábrica de `serialize` para columnas clasificadas (USRH1787204602825).
 *
 * Resuelve la categoría una vez al evaluar el decorador (carga del módulo).
 * Si el par no está en el catálogo, tapa siempre con máscara total: nunca
 * en claro por omisión.
 *
 * Política de producto: el valor en claro **nunca** viaja en GET/listados;
 * el rol y los permisos de consulta solo habilitan la UI y el reveal auditado.
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

    if (value.trim() === '') {
      return value
    }

    if (category === null) {
      return SENSITIVE_MASK
    }

    return maskSensitiveValue(value)
  }
}

/**
 * Fábrica de `serialize` para importes clasificados (USRH1787204602828).
 * Los importes sensibles no se entregan en claro por HTTP: sin permiso o con
 * permiso de consulta devuelven `null` (el claro va por reveal/export dedicado).
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

    return null
  }
}

/**
 * Enmascara un valor leído de la propiedad del modelo (DTO que no pasa por Lucid `serialize`).
 * Cadena vacía o en blanco se deja igual: no hay dato que tapar.
 */
export function maskSensitiveDtoValue(
  model: string,
  column: string,
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value.trim() === '') {
    return value
  }

  const category = catalog.categoryOf(model, column)
  if (category === null) {
    return SENSITIVE_MASK
  }
  return maskSensitiveValue(value)
}
