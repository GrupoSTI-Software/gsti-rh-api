import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { SENSITIVE_MASK, maskSensitiveValue } from '#helpers/sensitive_mask'

const catalog = new SensitiveFieldsCatalogService()

/**
 * Fábrica de `serialize` para columnas clasificadas (USRH1787204602825,
 * USRH1789328027048).
 *
 * Resuelve la categoría una vez al evaluar el decorador (carga del módulo).
 * Si el par no está en el catálogo, tapa siempre con máscara total: nunca
 * en claro por omisión.
 *
 * Política de producto: el valor en claro **nunca** viaja en GET/listados,
 * tenga o no el permiso de la categoría ni bypass de owner/root; el claro
 * solo sale por `GET /api/v1/pii/reveal` con asiento en bitácora.
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
 * Fábrica de `serialize` para importes clasificados (USRH1787204602828,
 * USRH1789477675774).
 *
 * Política de producto: el valor en claro **nunca** viaja en GET/listados;
 * el claro solo sale por `GET /api/v1/pii/reveal` con asiento en bitácora.
 * Si hay importe clasificado, se entrega la máscara fija `SENSITIVE_MASK`
 * (misma semántica que `sensitiveSerialize` en texto), nunca `null` ni
 * máscara parcial numérica.
 */
export function sensitiveSerializeNumeric(
  model: string,
  column: string
): (value: number | null) => string | null {
  const category = catalog.categoryOf(model, column)

  return (value: number | null): string | null => {
    if (value === null || value === undefined) {
      return null
    }

    if (category === null) {
      return null
    }

    return SENSITIVE_MASK
  }
}

/**
 * Enmascara un valor leído de la propiedad del modelo (DTO que no pasa por Lucid `serialize`).
 * Misma política que `sensitiveSerialize`: siempre tapado en HTTP (USRH1789328027048).
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
